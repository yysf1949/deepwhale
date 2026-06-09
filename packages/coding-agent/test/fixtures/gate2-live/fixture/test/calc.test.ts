import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { add, subtract, multiply, divide, power, squareRoot, clamp, factorial } from '../src/calc.ts';

test('add works', () => assert.equal(add(2, 3), 5));
test('subtract works', () => assert.equal(subtract(10, 3), 7));
test('multiply works', () => assert.equal(multiply(4, 5), 20));
test('divide works', () => assert.equal(divide(20, 4), 5));
test('power works', () => assert.equal(power(2, 3), 8));
test('squareRoot works', () => assert.equal(squareRoot(16), 4));
test('clamp below min returns min', () => assert.equal(clamp(1, 5, 10), 5));
test('clamp above max returns max', () => assert.equal(clamp(20, 5, 10), 10));
test('clamp in range returns value', () => assert.equal(clamp(7, 5, 10), 7));
test('factorial works', () => assert.equal(factorial(5), 120));
