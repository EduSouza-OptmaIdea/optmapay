// Declarações globais do Deno para evitar avisos de TypeScript no VS Code
declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
    export function set(key: string, value: string): void;
  }
}
