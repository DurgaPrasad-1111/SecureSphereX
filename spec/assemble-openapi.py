#!/usr/bin/env python3

"""

SecureSphere X — OpenAPI 3.1 Assembler

 

Projects the frozen baseline into an OpenAPI 3.1.0 document:

  Backend Architecture v1.3 · Canonical Boundary Contracts D0.10 v1.1.0 · API Contract v1.2

 

Canonical-backed schemas are NOT written here. They are $ref to components

produced by generate-canonical-schemas.py, per API Contract v1.2 §18.1.

 

Transport-only schemas are written here ONLY where the API Contract enumerates

their fields. Where it does not, the operation is emitted without that body and

an Architecture Change Request is recorded. Nothing is invented.

"""

 

from __future__ import annotations

import json, yaml

from pathlib import Path

 

CANON = json.loads(Path('/tmp/canonical-schemas.json').read_text())

schemas: dict = dict(CANON['schemas'])

ACR: list[dict] = []

 

 

def acr(ident, operation, missing, source_gap):

    ACR.append({'id': ident, 'operation': operation, 'missing': missing,

                'sourceGap': source_gap})

 

 

R = lambda n: {'$ref': f'#/components/schemas/{n}'}

 

# ── Transport-only schemas — fields enumerated by API Contract v1.2 only ────

schemas.update({

    'Error': {

        'type': 'object', 'description': 'API Contract v1.2 §11.1. `code` is the contract; `message` is not.',

        'required': ['code', 'message', 'correlationId', 'fieldErrors'],

        'properties': {

            'code': {'type': 'string'}, 'message': {'type': 'string'},

            'correlationId': {'type': 'string'},

            'fieldErrors': {'oneOf': [

                {'type': 'array', 'items': {'type': 'object',

                    'required': ['path', 'code'],

                    'properties': {'path': {'type': 'string'}, 'code': {'type': 'string'}},

                    'additionalProperties': False}},

                {'type': 'null'}]}},

        'additionalProperties': False},

 

    'GateSubmission': {

        'type': 'object',

        'description': ('API Contract v1.2 §8.1.1, §9.1. Evidence is D0.1; the envelope is '

                        'the HTTP projection of D0.10 InvocationContext with `tier` excluded '

                        'by Backend v1.3 §5.1 (BI-32). No field is defined by OpenAPI.'),

        'required': ['invocation', 'evidence'],

        'properties': {'invocation': R('InvocationContext'),

                       'evidence': {'type': 'array', 'items': R('SecurityEvidence')}},

        'additionalProperties': False},

 

    'FinalizationRequest': {

        'type': 'object', 'description': 'API Contract v1.2 §8.1.3.',

        'required': ['finalizedOn'],

        'properties': {'finalizedOn': {'type': 'string', 'format': 'date'}},

        'additionalProperties': False},

 

    'InterventionReport': {

        'type': 'object',

        'description': ('API Contract v1.2 §8.2.1. No tier, score or finding is accepted '

                        '(Backend v1.3 §5.2, BI-32).'),

        'required': ['interventionOrdinal', 'response'],

        'properties': {'interventionOrdinal': {'type': 'integer', 'minimum': 1},

                       'response': R('RecommendedResponse')},

        'additionalProperties': False},

 

    'DispositionReport': {

        'type': 'object', 'description': 'API Contract v1.2 §8.2.2.',

        'required': ['disposition'], 'properties': {'disposition': R('UserDisposition')},

        'additionalProperties': False},

 

    'IntelligenceLookupRequest': {

        'type': 'object',

        'description': ('API Contract v1.2 §8.3.1, §15.4. Prefix length must equal the '

                        'configured value exactly; a longer prefix is rejected, never truncated.'),

        'required': ['hashPrefix'], 'properties': {'hashPrefix': {'type': 'string'}},

        'additionalProperties': False},

 

    'RuleSetPointer': {

        'type': 'object', 'description': 'API Contract v1.2 §8.4.',

        'required': ['ruleSetVersion', 'digest'],

        'properties': {'ruleSetVersion': {'type': 'string'}, 'digest': {'type': 'string'}},

        'additionalProperties': False},

 

    'RuleSetDigest': {

        'type': 'object', 'description': 'API Contract v1.2 §8.4.',

        'required': ['digest'], 'properties': {'digest': {'type': 'string'}},

        'additionalProperties': False},

 

    'HistoryEntry': {

        'type': 'object',

        'description': 'API Contract v1.2 §8.5.1. Returns no pass internals.',

        'required': ['sessionId', 'resourceIdentity', 'effectiveTier', 'finalizedOn', 'degraded'],

        'properties': {'sessionId': {'type': 'string', 'format': 'uuid'},

                       'resourceIdentity': {'type': 'string', 'format': 'uuid'},

                       'effectiveTier': R('RiskTier'),

                       'finalizedOn': {'type': 'string', 'format': 'date'},

                       'degraded': {'type': 'boolean'}},

        'additionalProperties': False},

 

    'HistoryPage': {

        'type': 'object', 'description': 'API Contract v1.2 §7.3. Cursor is opaque.',

        'required': ['entries', 'nextCursor'],

        'properties': {'entries': {'type': 'array', 'items': R('HistoryEntry')},

                       'nextCursor': {'oneOf': [{'type': 'string'}, {'type': 'null'}]}},

        'additionalProperties': False},

 

    'SessionDetail': {

        'type': 'object',

        'description': ('API Contract v1.2 §8.5.2 — explanation level only. No weights, '

                        'suppressions, guard evaluations, subsumption or raw evidence (AD-5).'),

        'required': ['sessionId', 'resourceIdentity', 'effectiveTier', 'degraded',

                     'degradedReason', 'ruleSetVersion', 'finalizedOn', 'explanations'],

        'properties': {'sessionId': {'type': 'string', 'format': 'uuid'},

                       'resourceIdentity': {'type': 'string', 'format': 'uuid'},

                       'effectiveTier': R('RiskTier'), 'degraded': {'type': 'boolean'},

                       'degradedReason': {'oneOf': [{'type': 'string'}, {'type': 'null'}]},

                       'ruleSetVersion': {'type': 'string'},

                       'finalizedOn': {'type': 'string', 'format': 'date'},

                       'explanations': {'type': 'array', 'items': R('ExplanationItem')}},

        'additionalProperties': False},

 

    'ResourceSummary': {

        'type': 'object',

        'description': ('API Contract v1.2 §8.5.4. No Domain Security State, no Knowledge '

                        'Metadata, no Intelligence Object internals (AC-8).'),

        'required': ['resourceIdentity', 'score', 'tier', 'degraded', 'analysisCount'],

        'properties': {'resourceIdentity': {'type': 'string', 'format': 'uuid'},

                       'score': {'type': 'integer', 'minimum': 0}, 'tier': R('RiskTier'),

                       'degraded': {'type': 'boolean'},

                       'analysisCount': {'type': 'integer', 'minimum': 0}},

        'additionalProperties': False},

 

    'HealthStatus': {

        'type': 'object', 'description': 'API Contract v1.2 §8.7.',

        'required': ['status'],

        'properties': {'status': {'type': 'string', 'enum': ['ok', 'degraded', 'unavailable']}},

        'additionalProperties': False},

 

    'VersionReport': {

        'type': 'object',

        'description': 'API Contract v1.2 §8.7 — API, contract, rule-set and schema versions.',

        'required': ['apiVersion', 'contractVersions', 'ruleSetVersion', 'schemaVersion'],

        'properties': {'apiVersion': {'type': 'string'},

                       'contractVersions': {'type': 'object', 'additionalProperties': {'type': 'string'}},

                       'ruleSetVersion': {'type': 'string'}, 'schemaVersion': {'type': 'string'}},

        'additionalProperties': False},

})

 

# ── Architecture Change Requests: bodies with no source ─────────────────────

acr('ACR-1', 'POST /v1/identity/registrations', 'request body fields',

    'API Contract v1.2 §8.6 lists the endpoint and purpose; no field set is enumerated in any frozen document.')

acr('ACR-2', 'POST /v1/identity/sessions', 'request body fields', 'As ACR-1.')

acr('ACR-3', 'POST /v1/identity/sessions/refresh', 'request body fields', 'As ACR-1.')

acr('ACR-4', 'POST /v1/identity/mfa/factors · GET /v1/identity/mfa/factors',

    'request and response body fields', 'As ACR-1.')

acr('ACR-5', 'POST /v1/identity/mfa/challenges', 'request body fields', 'As ACR-1.')

acr('ACR-6', 'GET /v1/identity/preferences · PUT /v1/identity/preferences',

    'request and response body fields', 'As ACR-1.')

acr('ACR-7', 'GET /v1/identity/disclosure', 'response body fields', 'As ACR-1.')

acr('ACR-8', 'POST /v1/intelligence/lookups',

    '`IntelligenceEntry` element schema',

    'API Contract v1.2 §8.3.1 specifies the response as `{ bucket: IntelligenceEntry[] }`; '

    '`IntelligenceEntry` is defined in no D0.x contract and enumerated nowhere.')

acr('ACR-9', 'GET /v1/dashboard/reports/{reportId}', 'response body fields',

    'API Contract v1.2 §8.5.3 states the endpoint returns "report metadata and its projection"; '

    'neither is enumerated.')

 

ACR_NOTE = ('BODY NOT SPECIFIED — no frozen document enumerates it. Recorded as an '

            'Architecture Change Request; nothing is invented here. See Translation Issues Log.')

 

# ── Reusable responses ──────────────────────────────────────────────────────

def err(desc):

    return {'description': desc, 'content': {'application/json': {'schema': R('Error')}}}

 

COMMON_ERRORS = {

    '401': {'$ref': '#/components/responses/Unauthenticated'},

    '403': {'$ref': '#/components/responses/Forbidden'},

    '422': {'$ref': '#/components/responses/ValidationFailed'},

    '429': {'$ref': '#/components/responses/RateLimited'},

    '503': {'$ref': '#/components/responses/ServiceUnavailable'},

}

 

SESSION_PARAM = {'name': 'sessionId', 'in': 'path', 'required': True,

                 'schema': {'type': 'string', 'format': 'uuid'},

                 'description': 'Client-generated at navigation (Backend v1.3 §4.3). Authoritative over any body value.'}

 

CONTRACT_VERSION_HEADER = {'name': 'X-Contract-Version', 'in': 'header', 'required': True,

                           'schema': {'type': 'string'},

                           'description': 'API Contract v1.2 §9.2. Mismatch yields 409.'}

 

CORRELATION_HEADER = {'name': 'X-Correlation-Id', 'in': 'header', 'required': False,

                      'schema': {'type': 'string'},

                      'description': 'Optional; generated when absent and echoed on every response.'}

 

 

def op(op_id, summary, description, tags, security, *, params=None, body=None,

       responses=None, errors=None, deprecated_body_acr=None):

    o = {'operationId': op_id, 'summary': summary, 'description': description,

         'tags': tags, 'security': security}

    if params:

        o['parameters'] = params

    if body:

        o['requestBody'] = {'required': True,

                            'content': {'application/json': {'schema': R(body)}}}

    elif deprecated_body_acr:

        o['description'] = description + '\n\n' + ACR_NOTE

    o['responses'] = dict(responses or {})

    o['responses'].update(errors if errors is not None else COMMON_ERRORS)

    return o

 

 

EXT = [{'extensionCredential': []}]

USR = [{'userToken': []}]

NONE: list = []

 

paths: dict = {}

 

# ── Analysis Controller (Backend v1.3 §5.1) ────────────────────────────────

paths['/v1/analysis/sessions/{sessionId}/gates'] = {'post': op(

    'submitGate', 'Submit accumulated evidence at a Tier 2 gate',

    ('Materialises the Analysis Session under the client-generated identifier — there is no '

     'session creation endpoint (AC-4). Evidence for Tier 0, 1 and 2 is submitted together; '

     'the backend reconstructs the pass sequence. Idempotent on (sessionId, gateOrdinal).'),

    ['Analysis'], EXT,

    params=[SESSION_PARAM, CONTRACT_VERSION_HEADER, CORRELATION_HEADER],

    body='GateSubmission',

    responses={'200': {'description':

        ('Evaluated, or evaluation unavailable. Where the evaluation path is unavailable the '

         'response is 200 with a degraded view, or a literal null body when no prior state '

         'exists (API Contract §11.4). 503 is NOT used for evaluation unavailability.'),

        'content': {'application/json': {'schema': {'oneOf': [R('SecurityStateView'), {'type': 'null'}]}}}},

        '409': err('Contract version mismatch, session finalised, gate ordinal not dense, or submission in flight.'),

        '413': err('Payload exceeds bounds.'),

        '415': err('Content type not application/json.')})}

 

paths['/v1/analysis/sessions/{sessionId}/state'] = {'get': op(

    'getCurrentState', 'Retrieve current security state',

    'Returns the platform\'s present belief for the session. Read-your-writes after a gate response.',

    ['Analysis'], EXT, params=[SESSION_PARAM, CORRELATION_HEADER],

    responses={'200': {'description': 'Current state, or null where none has been committed.',

                       'content': {'application/json': {'schema': {'oneOf': [R('SecurityStateView'), {'type': 'null'}]}}}},

               '404': err('Session not materialised — no gate has been submitted.')})}

 

paths['/v1/analysis/sessions/{sessionId}/finalization'] = {'post': op(

    'finalizeSession', 'Finalise an Analysis Session',

    ('Finalises the session. Report metadata is created as a side effect within the same unit '

     'of work (AC-5); there is no report creation endpoint. Idempotent.'),

    ['Analysis'], EXT, params=[SESSION_PARAM, CORRELATION_HEADER], body='FinalizationRequest',

    responses={'204': {'description': 'Finalised, or already finalised.'},

               '404': err('Session not materialised.')})}

 

# ── Intervention Controller (Backend v1.3 §5.2) ────────────────────────────

paths['/v1/analysis/sessions/{sessionId}/interventions'] = {'post': op(

    'reportIntervention', 'Report that an intervention was presented',

    ('Sets the intervention lock on the corresponding pass. Accepts no tier, score or finding '

     '(Backend v1.3 §5.2, BI-32) — the backend already holds the tier it computed. '

     'Idempotent on (sessionId, interventionOrdinal).'),

    ['Intervention'], EXT, params=[SESSION_PARAM, CONTRACT_VERSION_HEADER, CORRELATION_HEADER],

    body='InterventionReport',

    responses={'204': {'description': 'Recorded.'},

               '404': err('Session not materialised.'),

               '409': err('No committed pass corresponds to this intervention.')})}

 

paths['/v1/analysis/sessions/{sessionId}/interventions/{interventionOrdinal}/disposition'] = {'put': op(

    'reportDisposition', 'Report the user disposition for an intervention',

    ('Recorded as an audit event; not persisted as domain data (Backend v1.3 §5.2, §10.10). '

     'Guard G-02 is enforced client-side and does not depend on this report.'),

    ['Intervention'], EXT,

    params=[SESSION_PARAM,

            {'name': 'interventionOrdinal', 'in': 'path', 'required': True,

             'schema': {'type': 'integer', 'minimum': 1}},

            CONTRACT_VERSION_HEADER, CORRELATION_HEADER],

    body='DispositionReport',

    responses={'204': {'description': 'Recorded as an audit event.'},

               '404': err('Session or intervention not found.')})}

 

# ── Threat Intelligence Controller (Backend v1.3 §5.3) ─────────────────────

paths['/v1/intelligence/lookups'] = {'post': op(

    'lookupIntelligence', 'k-anonymity prefix lookup',

    ('POST is used so the prefix does not appear in access, proxy or browser-history logs. '

     'The operation has no side effect and may be retried freely. The prefix length must '

     'equal the configured value exactly; a longer prefix is rejected, never truncated '

     '(API Contract §15.4).'),

    ['Intelligence'], EXT, params=[CORRELATION_HEADER], body='IntelligenceLookupRequest',

    responses={'200': {'description':

        'Every entry in the prefix bucket. Final matching occurs client-side.\n\n' + ACR_NOTE}})}

 

# ── Rule Distribution Controller (Backend v1.3 §5.4) ───────────────────────

paths['/v1/rulesets/current'] = {'get': op(

    'getCurrentRuleSet', 'Current recommended rule-set version',

    'Rule sets are not public; authentication is required.', ['RuleSet'], EXT,

    params=[CORRELATION_HEADER],

    responses={'200': {'description': 'Current recommended version and digest.',

                       'content': {'application/json': {'schema': R('RuleSetPointer')}}}})}

 

paths['/v1/rulesets/{ruleSetVersion}'] = {'get': op(

    'getRuleSet', 'Fetch a released rule-set artifact',

    'A released version is immutable and may be cached indefinitely. An unreleased version is never served.',

    ['RuleSet'], EXT,

    params=[{'name': 'ruleSetVersion', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},

            CORRELATION_HEADER],

    responses={'200': {'description': 'The rule-set artifact.',

                       'content': {'application/json': {'schema': R('RuleSet')}}},

               '404': err('Unknown version.'),

               '409': err('Version exists but is not released.'),

               '500': err('Integrity verification failed; an alert is raised.')})}

 

paths['/v1/rulesets/{ruleSetVersion}/digest'] = {'get': op(

    'getRuleSetDigest', 'Fetch a rule-set integrity digest', 'Immutable.', ['RuleSet'], EXT,

    params=[{'name': 'ruleSetVersion', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},

            CORRELATION_HEADER],

    responses={'200': {'description': 'Integrity digest.',

                       'content': {'application/json': {'schema': R('RuleSetDigest')}}},

               '404': err('Unknown version.')})}

 

# ── Dashboard Controller (Backend v1.3 §5.5) ───────────────────────────────

paths['/v1/dashboard/history'] = {'get': op(

    'getHistory', 'Saved analysis history',

    ('Returns the sessions the user has explicitly saved. No user-session association exists in '

     'the model, so this is the whole of what a user owns (API Contract §6.1). Cursor-paginated.'),

    ['Dashboard'], USR,

    params=[{'name': 'cursor', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},

            {'name': 'limit', 'in': 'query', 'required': False,

             'schema': {'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 25}},

            {'name': 'tier', 'in': 'query', 'required': False, 'schema': R('RiskTier')},

            {'name': 'from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},

            {'name': 'to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},

            CORRELATION_HEADER],

    responses={'200': {'description': 'A page of saved history entries.',

                       'content': {'application/json': {'schema': R('HistoryPage')}}}})}

 

paths['/v1/dashboard/sessions/{sessionId}'] = {'get': op(

    'getSessionDetail', 'Session detail, explanation level',

    ('Returns matched rule identifiers and their summaries. Weights, suppressions, guard '

     'evaluations, subsumption and raw evidence are not exposed (AD-5); they are reachable '

     'only through the offline replay tool.'),

    ['Dashboard'], USR, params=[SESSION_PARAM, CORRELATION_HEADER],

    responses={'200': {'description': 'Explanation-level session detail.',

                       'content': {'application/json': {'schema': R('SessionDetail')}}},

               '404': err('Not found.')})}

 

paths['/v1/dashboard/reports/{reportId}'] = {'get': op(

    'getReport', 'Retrieve report metadata',

    'Analytical detail resolves through the referenced session, subject to the same depth limits.',

    ['Dashboard'], USR,

    params=[{'name': 'reportId', 'in': 'path', 'required': True,

             'schema': {'type': 'string', 'format': 'uuid'}}, CORRELATION_HEADER],

    responses={'200': {'description': 'Report metadata.\n\n' + ACR_NOTE},

               '404': err('Not found.')})}

 

paths['/v1/dashboard/resources/{resourceIdentity}'] = {'get': op(

    'getResourceSummary', 'Resource summary',

    'No Domain Security State and no Knowledge Metadata — both are internal with no API representation (AC-8).',

    ['Dashboard'], USR,

    params=[{'name': 'resourceIdentity', 'in': 'path', 'required': True,

             'schema': {'type': 'string', 'format': 'uuid'}}, CORRELATION_HEADER],

    responses={'200': {'description': 'Resource summary.',

                       'content': {'application/json': {'schema': R('ResourceSummary')}}},

               '404': err('Not found.')})}

 

# ── Identity Controller (Backend v1.3 §5.6) — bodies blocked by ACR ────────

def identity_op(op_id, summary, tags_desc, security, acr_id, extra_params=None):

    return op(op_id, summary,

              f'{tags_desc}\n\nBlocked by {acr_id}.',

              ['Identity'], security,

              params=(extra_params or []) + [CORRELATION_HEADER],

              deprecated_body_acr=acr_id,

              responses={'200': {'description': 'Success.\n\n' + ACR_NOTE}})

 

paths['/v1/identity/registrations'] = {'post': identity_op(

    'register', 'Create an account', 'Account creation.', NONE, 'ACR-1')}

paths['/v1/identity/sessions'] = {'post': identity_op(

    'login', 'Authenticate', 'Returns access and rotating refresh tokens.', NONE, 'ACR-2')}

paths['/v1/identity/sessions/refresh'] = {'post': identity_op(

    'refreshSession', 'Rotate tokens', 'Rotation with reuse detection.', NONE, 'ACR-3')}

paths['/v1/identity/sessions/current'] = {'delete': op(

    'logout', 'Log out',

    'Revokes the refresh token. AC-7 prohibits deletion of the analytical record; an '

    'authentication session is not analytical data.',

    ['Identity'], USR, params=[CORRELATION_HEADER],

    responses={'204': {'description': 'Logged out.'}})}

paths['/v1/identity/mfa/factors'] = {

    'post': identity_op('enrollMfaFactor', 'Enrol an MFA factor', 'Enrolment.', USR, 'ACR-4'),

    'get': identity_op('listMfaFactors', 'List MFA factors', 'Listing.', USR, 'ACR-4')}

paths['/v1/identity/mfa/challenges'] = {'post': identity_op(

    'verifyMfaChallenge', 'Verify an MFA challenge', 'Verification.', NONE, 'ACR-5')}

paths['/v1/identity/preferences'] = {

    'get': identity_op('getPreferences', 'Read preferences', 'Preferences.', USR, 'ACR-6'),

    'put': identity_op('setPreferences', 'Replace preferences', 'Preferences.', USR, 'ACR-6')}

paths['/v1/identity/disclosure'] = {'get': identity_op(

    'getDisclosure', 'Authentication History disclosure text',

    'The user-facing statement required by Rule Engine §20.9.7.', USR, 'ACR-7')}

 

# ── Health Controller (Backend v1.3 §5.7) ──────────────────────────────────

paths['/health/live'] = {'get': op(

    'getLiveness', 'Liveness', 'Process responsive. Unversioned: reports the deployment, not an API version.',

    ['Health'], NONE, responses={'200': {'description': 'Alive.',

        'content': {'application/json': {'schema': R('HealthStatus')}}}}, errors={})}

paths['/health/ready'] = {'get': op(

    'getReadiness', 'Readiness',

    'Ready requires the database reachable, the Evaluation Port healthy, and a valid rule set loaded. '

    'A backend with no valid rule set is not ready.',

    ['Health'], NONE, responses={'200': {'description': 'Ready.',

        'content': {'application/json': {'schema': R('HealthStatus')}}},

        '503': {'description': 'Not ready.',

                'content': {'application/json': {'schema': R('HealthStatus')}}}}, errors={})}

paths['/health/version'] = {'get': op(

    'getVersion', 'Version report', 'API, contract, rule-set and schema versions.',

    ['Health'], EXT, params=[CORRELATION_HEADER],

    responses={'200': {'description': 'Versions.',

        'content': {'application/json': {'schema': R('VersionReport')}}}})}

 

# ── Document ────────────────────────────────────────────────────────────────

doc = {

    'openapi': '3.1.0',

    'info': {

        'title': 'SecureSphere X API',

        'version': '1.2.0',

        'summary': 'Projection of the frozen SecureSphere X architecture into HTTP.',

        'description': (

            'Generated from Backend Architecture v1.3, Canonical Boundary Contracts D0.10 v1.1.0, '

            'and API Contract v1.2.\n\n'

            'This document is a projection, not a source of architectural truth. Canonical-backed '

            'schemas are generated from the D0.x TypeScript contracts and referenced by `$ref`; '

            'none is hand-written (API Contract §18.1).\n\n'

            'Two behaviours depart from HTTP convention and are architectural: evaluation '

            'unavailability returns 200 with a possibly-null body rather than 503, and an '

            'over-long k-anonymity prefix is rejected rather than truncated.'),

        'license': {'name': 'Proprietary', 'identifier': 'LicenseRef-Proprietary'},

    },

    'servers': [{'url': 'https://{host}/', 'variables': {'host': {'default': 'api.securesphere.example'}}}],

    'tags': [

        {'name': 'Analysis', 'description': 'Backend v1.3 §5.1 — Analysis Controller'},

        {'name': 'Intervention', 'description': 'Backend v1.3 §5.2 — Intervention Controller'},

        {'name': 'Intelligence', 'description': 'Backend v1.3 §5.3 — Threat Intelligence Controller'},

        {'name': 'RuleSet', 'description': 'Backend v1.3 §5.4 — Rule Distribution Controller'},

        {'name': 'Dashboard', 'description': 'Backend v1.3 §5.5 — Dashboard Controller'},

        {'name': 'Identity', 'description': 'Backend v1.3 §5.6 — Identity Controller'},

        {'name': 'Health', 'description': 'Backend v1.3 §5.7 — Health and Readiness Controller'},

    ],

    'paths': paths,

    'components': {

        'securitySchemes': {

            'extensionCredential': {

                'type': 'http', 'scheme': 'bearer',

                'description': ('Build-embedded extension credential, presented on each request '

                                '(Backend v1.3 §10.1.1). There is no token exchange and no '

                                'enrolment endpoint. The credential identifies the build, not the '

                                'installation, is assumed public, and is therefore not a '

                                'rate-limiting key — limits are keyed on source address (CR-1).')},

            'userToken': {

                'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT',

                'description': ('Asymmetrically signed JWT (EdDSA or RS256) with a rotating '

                                'refresh token and reuse detection (Backend v1.3 §10.7).')},

        },

        'responses': {

            'Unauthenticated': err('Authentication absent, expired or invalid.'),

            'Forbidden': err('Authenticated but not permitted — wrong principal type, or resource not owned. '

                             'An unowned resource yields 403, never 404 (API Contract §6.2).'),

            'ValidationFailed': err('Schema or semantic validation failure. Unknown fields are rejected, never ignored.'),

            'RateLimited': err('Rate limit exceeded. Keyed on source address for extension surfaces.'),

            'ServiceUnavailable': err('Database or dependency unavailable. Never used for evaluation unavailability.'),

        },

        'schemas': dict(sorted(schemas.items())),

    },

}

 

Path('/mnt/user-data/outputs/securesphere-openapi-3.1.yaml').write_text(

    yaml.safe_dump(doc, sort_keys=False, width=100, allow_unicode=True))

Path('/tmp/acr.json').write_text(json.dumps(ACR, indent=2))

 

canon_names = set(CANON['schemas'])

transport_names = set(schemas) - canon_names

ops = sum(len([m for m in v if m in ('get', 'post', 'put', 'delete', 'patch')]) for v in paths.values())

 

print(f'paths      : {len(paths)}')

print(f'operations : {ops}')

print(f'schemas    : {len(schemas)}  (canonical {len(canon_names)} / transport-only {len(transport_names)})')

print(f'ACRs       : {len(ACR)}')