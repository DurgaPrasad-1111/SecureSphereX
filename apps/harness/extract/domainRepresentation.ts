/**
 * `domainRepresentation` category extraction: host -> DomainRepresentationEvidence.
 *
 * The most expensive of the three categories built in this pass, and the one
 * with the most convention embedded in it. Every convention is stated here
 * rather than left implicit, because two of them (scriptsUsed's semantics,
 * confusableSkeleton's absent-vs-present) were live defects before this file
 * existed and the extractor is what settles them in practice.
 *
 * IDNA is Node's own ICU-backed `domainToUnicode`/`domainToASCII` — no
 * dependency, and the same UTS-46 implementation the URL parser uses, so the
 * Unicode and punycode forms cannot disagree with what `new URL()` produced.
 */

import { domainToUnicode, domainToASCII } from 'node:url';
import {
  present, absent, notCollected,
  type DomainRepresentationEvidence, type Observation,
} from '../../../packages/contracts/evidence.contract.v1.ts';
// A1.2: scriptsOf + confusableSkeleton are SHARED with the extension via
// packages/engine/domain-classify.ts — neither producer carries a copy
// (DEFECT-34). Only the ICU UTS-46 conversion below stays node-specific.
import { scriptsOf, confusableSkeleton } from '../../../packages/engine/domain-classify.ts';

export function unobservedDomainRepresentation(): DomainRepresentationEvidence {
  const nc = <T>(): Observation<T> => notCollected<T>('api_unavailable');
  return {
    unicodeDomain: nc<string>(), punycodeDomain: nc<string>(),
    isIdn: nc<boolean>(), containsNonAscii: nc<boolean>(),
    scriptsUsed: nc<readonly string[]>(), isMixedScript: nc<boolean>(),
    confusableSkeleton: nc<string>(),
  };
}

export function extractDomainRepresentation(hostname: string | null): DomainRepresentationEvidence {
  if (hostname === null || hostname === '') return unobservedDomainRepresentation();

  // Both directions from the SAME host string, via ICU UTS-46. `domainToUnicode`
  // is a no-op on an already-Unicode host and decodes `xn--` labels; likewise
  // `domainToASCII` in reverse. Either can return '' on an input ICU rejects.
  const unicodeDomain = domainToUnicode(hostname) || hostname;
  const punycodeDomain = domainToASCII(hostname) || hostname;

  const containsNonAscii = /[^\x00-\x7F]/.test(unicodeDomain);

  // isIdn is measured on the PUNYCODE form: a domain is an IDN iff some label
  // carries the `xn--` ACE prefix. Measuring it on the Unicode form would make
  // it a synonym for containsNonAscii, which the contract lists separately —
  // two fields that always agree would be one field.
  //
  // (This is the representation ambiguity `consistency.ts` declines to judge:
  // an IDN's punycode form is pure ASCII while its Unicode form is not, and
  // the contract never says which representation containsNonAscii measures.
  // Resolved HERE by measuring the two fields on DIFFERENT forms, which is
  // what makes them independent. Recorded, not silently chosen.)
  const isIdn = punycodeDomain.split('.').some((l) => l.toLowerCase().startsWith('xn--'));

  const scriptsUsed = scriptsOf(unicodeDomain);
  const skeleton = confusableSkeleton(unicodeDomain);

  return {
    unicodeDomain: present(unicodeDomain),
    punycodeDomain: present(punycodeDomain),
    isIdn: present(isIdn),
    containsNonAscii: present(containsNonAscii),
    scriptsUsed: present(scriptsUsed),
    isMixedScript: present(scriptsUsed.length >= 2),

    // DEC-20's convention, load-bearing: present ONLY when the skeleton
    // differs from the domain it was derived from.
    confusableSkeleton:
      skeleton !== unicodeDomain.toLowerCase() ? present(skeleton) : absent<string>(),
  };
}
