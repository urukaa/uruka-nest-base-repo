import z from "zod";

export class ExampleValidation {
  static readonly CREATE = z.object({

  });

  static readonly UPDATE = this.CREATE.partial();
}

export type CreateExample = z.infer<typeof ExampleValidation.CREATE>;
export type UpdateExample = z.infer<typeof ExampleValidation.UPDATE>;