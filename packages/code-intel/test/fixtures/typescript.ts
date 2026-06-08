import { foo } from './bar.js';

export const importedFoo = foo;

export class Greeter {
  greet(name: string): string {
    return `hi ${name}`;
  }
}

export function hello(): Greeter {
  return new Greeter();
}
