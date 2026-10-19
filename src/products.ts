import { isToolUIPart, type UIMessage } from 'ai';
import { z } from 'zod';

export const productSchema = z.object({
  sku: z.string(), name: z.string(), description: z.string(),
  imagePath: z.string().regex(/^\/images\/[a-z0-9-]+\.jpg$/),
  imageAlt: z.string(), imageAuthor: z.string(),
  imageSource: z.url().startsWith('https://commons.wikimedia.org/wiki/'),
  imageLicense: z.string(), imageLicenseUrl: z.url().startsWith('https://creativecommons.org/'),
});

/** Cards come from retrieved records cited in this answer, never model-authored image URLs. */
export function getCitedProducts(message: UIMessage) {
  const answer = message.parts.filter(part => part.type === 'text').map(part => part.text).join('\n');
  const products = new Map<string, { sourceId: string; product: z.infer<typeof productSchema> }>();
  const sourceSchema = z.object({ id: z.string(), product: productSchema.optional() });
  const outputSchema = z.object({ results: z.array(sourceSchema), referenced: z.array(sourceSchema) });
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.type !== 'tool-searchKnowledge' || part.state !== 'output-available') continue;
    const output = outputSchema.safeParse(part.output);
    if (!output.success) continue;
    for (const source of [...output.data.results, ...output.data.referenced]) {
      if (source.product && answer.includes(`[${source.id}]`)) {
        products.set(source.product.sku, { sourceId: source.id, product: source.product });
      }
    }
  }
  return [...products.values()];
}
