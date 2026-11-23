import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { IGetRecommendationsUseCase } from '../../application/get-recommendations.use-case';
import { CATEGORY_PATTERN, CATEGORY_PATTERN_SOURCE } from '../../domain/category';
import { isValidationError } from '../../domain/dependency-error';

const QuerySchema = z.object({
  userId: z
    .string({ required_error: "Parameter 'userId' is required" })
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "Parameter 'userId' must match pattern '^[a-zA-Z0-9_\\-]+$'"),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: "Parameter 'limit' must be an integer between 1 and 50",
    }),
  // RNF-104 (ADR-0011): lista de caracteres permitidos antes de a categoria chegar ao FT.SEARCH.
  category: z
    .string()
    .regex(CATEGORY_PATTERN, `Parameter 'category' must match pattern '${CATEGORY_PATTERN_SOURCE}'`)
    .optional(),
  sessionItemIds: z.string().optional(),
  explain: z
    .enum(['true', 'false'], { errorMap: () => ({ message: "Parameter 'explain' must be 'true' or 'false'" }) })
    .optional()
    .transform((v) => v === 'true'),
});

export class RecommendationController {
  private useCase: IGetRecommendationsUseCase;

  constructor(useCase: IGetRecommendationsUseCase) {
    this.useCase = useCase;
  }

  public async getRecommendations(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parseResult = QuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Validation error';
      reply.status(400).send({
        error: 'Bad Request',
        message: firstError,
        requestId: req.id,
      });
      return;
    }

    const { userId, limit, category, sessionItemIds, explain } = parseResult.data;

    const parsedSessionItems = sessionItemIds
      ? sessionItemIds.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;

    try {
      const response = await this.useCase.execute({
        userId,
        limit,
        category,
        sessionItemIds: parsedSessionItems,
        requestId: req.id,
        explain,
      });

      reply.status(200).send(response);
    } catch (err: unknown) {
      // Erro de validação vindo de uma camada interna é entrada recusada: 400, não 500 (RF-106).
      if (isValidationError(err)) {
        reply.status(400).send({
          error: 'Bad Request',
          message: err instanceof Error ? err.message : 'Validation error',
          requestId: req.id,
        });
        return;
      }
      const message = err instanceof Error ? err.message : 'Internal error processing recommendations';
      reply.status(500).send({
        error: 'Internal Server Error',
        message,
        requestId: req.id,
      });
    }
  }
}
