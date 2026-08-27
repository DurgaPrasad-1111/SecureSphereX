/** Per-module version tracking, per DEC-15's LDD signal (module_version
 *  is stored per-row, implying independent per-module versioning).
 *  All currently '0.1.0' because no module has diverged yet -- this
 *  structure exists so a future single-module patch can bump its own
 *  version without redesign, not because the values differ today.
 *
 *  Architecture Owner ruling, 2026-08-27: the shared-engine-constant option
 *  (DEC-15's option (a)) was REJECTED. A single value for all ten modules
 *  would defeat the field's actual purpose — audit and deterministic replay
 *  (§4.3, §17.2) need to show WHICH module version produced a given finding.
 *
 *  Drift against packages/engine/package.json is guarded by
 *  module-versions.fixture.test.ts, which fails if any entry falls out of
 *  step with the package version while the modules remain unforked.
 */

import type { ModuleId } from '../contracts/evaluation.contract.v1';

export const MODULE_VERSIONS: Record<ModuleId, string> = {
  url: '0.1.0', ssl: '0.1.0', dns: '0.1.0', redirect: '0.1.0',
  loginForm: '0.1.0', javascript: '0.1.0', homograph: '0.1.0',
  authContext: '0.1.0', downloadContext: '0.1.0', permissionContext: '0.1.0',
};
