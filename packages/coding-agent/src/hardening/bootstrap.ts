import { AuditLog } from '../observability/audit-log.js';
import type { SignalHandlerOptions } from './signal-handler.js';
import type { ProcessUncaughtHandlerOptions } from './process-uncaught-handler.js';
import { installSignalHandlers } from './signal-handler.js';
import { installProcessUncaughtHandlers } from './process-uncaught-handler.js';
import { gracefulShutdown } from './graceful-shutdown.js';

export interface HardeningBootstrapOptions {
  readonly auditLog?: AuditLog;
  readonly onComplete?: () => void | Promise<void>;
  readonly signalHandlerOptions?: SignalHandlerOptions;
  readonly uncaughtHandlerOptions?: ProcessUncaughtHandlerOptions;
}

export interface HardeningBootstrapResult {
  readonly signalHandlersInstalled: boolean;
  readonly uncaughtHandlersInstalled: boolean;
  readonly shutdownRegistered: boolean;
}

let signalsInstalled = false;
let uncaughtInstalled = false;
let shutdownRegistered = false;

export function _resetHardeningStateForTesting(): void {
  signalsInstalled = false;
  uncaughtInstalled = false;
  shutdownRegistered = false;
}

export function bootstrapHardening(
  options: HardeningBootstrapOptions = {},
): HardeningBootstrapResult {
  const { auditLog, onComplete, signalHandlerOptions, uncaughtHandlerOptions } = options;

  let signalHandlersInstalled = false;
  if (!signalsInstalled) {
    signalsInstalled = true;
    signalHandlersInstalled = true;
    installSignalHandlers(auditLog ?? new AuditLog(), signalHandlerOptions);
  }

  let uncaughtHandlersInstalled = false;
  if (!uncaughtInstalled) {
    uncaughtInstalled = true;
    uncaughtHandlersInstalled = true;
    installProcessUncaughtHandlers(auditLog ?? new AuditLog(), uncaughtHandlerOptions);
  }

  let shutdownFlag = false;
  if (!shutdownRegistered) {
    shutdownRegistered = true;
    shutdownFlag = true;
    process.on('beforeExit', () => {
      const log = auditLog ?? new AuditLog();
      void gracefulShutdown(log, 'manual', {
        ...(onComplete !== undefined ? { onComplete: () => onComplete() } : {}),
      });
    });
  }

  return {
    signalHandlersInstalled,
    uncaughtHandlersInstalled,
    shutdownRegistered: shutdownFlag,
  };
}
