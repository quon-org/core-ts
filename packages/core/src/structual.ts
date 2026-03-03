export type Structural =
  | string
  | number
  | boolean
  | null
  | undefined
  | Structural[]
  | { [key: string | symbol]: Structural };
