import { target } from '@api/api';
import defaultWorker from './workers/default-worker';
import * as featureNS from './feature';

export function caller() {
  target();
  defaultWorker();
  featureNS.lazyFeature();
}

export async function dynamicImporter() {
  const m = await import('./feature');
  return m.lazyFeature();
}
