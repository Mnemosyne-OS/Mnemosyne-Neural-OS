/**
 * test-setup — the DOM matchers, registered the way this workspace can take.
 *
 * 🪤 DO NOT change this to `@testing-library/jest-dom/vitest`. That entry point
 * is written for vitest 2/3: it reaches into the expect state and sets
 * `testPath`, which is getter-only in the vitest 1.6 this workspace pins. The
 * failure lands during setup, so EVERY file in the cartridge dies with
 * `Cannot set property testPath of #<Object> which has only a getter` and not
 * one assertion ever runs. It has already cost one cartridge its entire suite.
 *
 * The `/matchers` entry is the version-neutral one: it exports the matchers and
 * nothing else, and `expect.extend` is the same in every vitest.
 */
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
