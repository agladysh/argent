import type { JsonObject } from '@ark/util';
import {
  type FunctionDeclaration,
  type GenerateContentParameters,
  FunctionCallingConfigMode,
  type GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import { type Type, type, ArkErrors } from 'arktype';

interface AIQuery {
  value: string;
}

interface AIContext {
  value: string;
}

type AISelect = JsonObject;

export interface AIRequest {
  query: AIQuery;
  context: AIContext[];
  select: AISelect[];
}

type AIResponseValidators = Record<string, Type>;

interface AIRequestFunctions {
  functionDeclarations: FunctionDeclaration[];
  allowedFunctionNames: string[];
  validators: AIResponseValidators;
}

function buildFunctionDeclarations(data: AISelect[]): AIRequestFunctions {
  const result: AIRequestFunctions = {
    functionDeclarations: [],
    allowedFunctionNames: [],
    validators: {},
  };

  for (let i = 0; i < data.length; ++i) {
    const name = `option-${i}`;
    const validator = type(data[i]);
    result.functionDeclarations.push({
      name,
      parametersJsonSchema: validator.toJsonSchema(),
    });
    result.allowedFunctionNames.push(name);
    result.validators[name] = validator;
  }

  return result;
}

interface AIRequestParameters {
  request: GenerateContentParameters;
  validators: AIResponseValidators;
}

function buildAIRequestParameters({ query, context, select }: AIRequest): AIRequestParameters {
  const functions = buildFunctionDeclarations(select);
  const system = context.map((c) => c.value).join('\n');
  const user = `User message:
<user>
${query.value}
</user>
Answer by using a function call. Strictly follow the schema:
<schema>
${JSON.stringify(functions.functionDeclarations, null, 2)}
</schema>
`;
  return {
    validators: functions.validators,
    request: {
      model: 'gemini-flash-latest',
      contents: [
        {
          parts: [{ text: user }],
          role: 'user',
        },
      ],
      config: {
        systemInstruction: system,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY, // Force a function call.
            allowedFunctionNames: functions.allowedFunctionNames,
          },
        },
        tools: [{ functionDeclarations: functions.functionDeclarations }],
        temperature: 0,
      },
    },
  };
}

interface AIResponse {
  name: string;
  args: Record<string, unknown>;
}

function extractAIResponse(response: GenerateContentResponse): AIResponse {
  const { name, args } = ((response?.candidates ?? [])[0]?.content?.parts ?? [])[0].functionCall ?? {};
  if (!args || !name) {
    console.error(response);
    throw new Error(`Bad LLM response`); // TODO: Probably a rate limiting error. Handle it.
  }

  return { name, args };
}

// TODO: This should lift result type union from Type.
export async function requestAI(input: AIRequest) {
  const params = buildAIRequestParameters(input);
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is unset');
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const request = params.request;

  let triesLeft = 2;
  while (triesLeft-- > 0) {
    const { name, args } = extractAIResponse(await ai.models.generateContent(request));
    if (!(name in params.validators)) {
      throw new Error(
        `LLM responded with unknown tool call ${name}, known are ${Object.keys(params.validators).join(', ')}`
      );
    }

    const validated = params.validators[name](args);
    if (!(validated instanceof ArkErrors)) {
      return validated;
    }

    console.warn('LLM returned malformed response:', validated.summary);

    if (!Array.isArray(request.contents)) {
      throw new Error('unreachable'); // Guard to make TS happy
    }

    request.contents.push(
      {
        parts: [{ functionCall: { name, args } }],
        role: 'model',
      },
      {
        parts: [
          {
            text: `
"${name}" function call you made above violates the provided schema:
<error>
${validated.summary}
</error>
Correct the function call by strictly adhering to the schema:
<schema>
${JSON.stringify(params.validators[name].toJsonSchema(), null, 0)}
</schema>
Retry the corrected function call.
`,
          },
        ],
        role: 'user',
      }
    );
  }

  throw new Error('Given up on trying to get well-formed response from LLM');
}
