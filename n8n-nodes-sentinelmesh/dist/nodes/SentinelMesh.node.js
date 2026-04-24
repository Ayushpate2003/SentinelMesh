"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentinelMesh = void 0;
const n8n_workflow_1 = require("n8n-workflow");
class SentinelMesh {
    constructor() {
        this.description = {
            displayName: 'SentinelMesh Security Gate',
            name: 'sentinelMesh',
            icon: 'file:sentinelmesh.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["actionName"]}}',
            description: 'Evaluate workflow actions against SentinelMesh security policy',
            defaults: {
                name: 'SentinelMesh Security Gate',
            },
            credentials: [
                {
                    name: 'sentinelMeshApi',
                    required: true,
                },
            ],
            inputs: ['main'],
            outputs: ['main'],
            properties: [
                {
                    displayName: 'Integration ID',
                    name: 'integrationId',
                    type: 'string',
                    default: '',
                    required: true,
                    description: 'Integration ID created in SentinelMesh user dashboard',
                },
                {
                    displayName: 'Action Name',
                    name: 'actionName',
                    type: 'string',
                    default: 'workflow_action_name',
                    required: true,
                    description: 'Action identifier evaluated by SentinelMesh',
                },
                {
                    displayName: 'Payload (JSON)',
                    name: 'payload',
                    type: 'json',
                    default: '{ "data": "={{ $json }}" }',
                    required: true,
                    description: 'Event metadata payload sent to SentinelMesh',
                },
                {
                    displayName: 'Fail on Block',
                    name: 'failOnBlock',
                    type: 'boolean',
                    default: true,
                    description: 'If enabled, stop execution when SentinelMesh returns BLOCK',
                },
                {
                    displayName: 'Enable Debug Logs',
                    name: 'debugMode',
                    type: 'boolean',
                    default: false,
                    description: 'If enabled, include raw API response in node output',
                },
            ],
        };
    }
    async execute() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const items = this.getInputData();
        const returnData = [];
        const credentials = await this.getCredentials('sentinelMeshApi');
        const baseUrl = String((_a = credentials.baseUrl) !== null && _a !== void 0 ? _a : '').trim();
        const token = String((_b = credentials.token) !== null && _b !== void 0 ? _b : '');
        if (!/^https?:\/\//i.test(baseUrl)) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'SentinelMesh base URL must start with http:// or https://');
        }
        if (!token) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'SentinelMesh integration token is required');
        }
        const apiEndpoint = `${baseUrl.replace(/\/+$/, '')}/api/v1/events`;
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const integrationId = this.getNodeParameter('integrationId', itemIndex);
            const actionName = this.getNodeParameter('actionName', itemIndex);
            const payloadInput = this.getNodeParameter('payload', itemIndex);
            const failOnBlock = this.getNodeParameter('failOnBlock', itemIndex, true);
            const debugMode = this.getNodeParameter('debugMode', itemIndex, false);
            const headers = {
                'content-type': 'application/json',
                accept: 'application/json',
                authorization: `Bearer ${token}`,
            };
            const metadata = typeof payloadInput === 'string'
                ? JSON.parse(payloadInput)
                : (payloadInput !== null && payloadInput !== void 0 ? payloadInput : {});
            let decision = 'ALLOW';
            let riskScore = 0;
            let reason = 'Allowed by SentinelMesh';
            let rawResponse = null;
            let statusCode = 200;
            try {
                const response = await this.helpers.httpRequest({
                    method: 'POST',
                    url: apiEndpoint,
                    headers,
                    body: {
                        integration_id: integrationId,
                        action: actionName,
                        metadata,
                    },
                    json: true,
                    returnFullResponse: true,
                });
                statusCode = (_c = response.statusCode) !== null && _c !== void 0 ? _c : 200;
                rawResponse = ((_d = response.body) !== null && _d !== void 0 ? _d : null);
                const body = ((_e = response.body) !== null && _e !== void 0 ? _e : {});
                decision = (_f = body.decision) !== null && _f !== void 0 ? _f : 'ALLOW';
                riskScore = Number((_g = body.risk_score) !== null && _g !== void 0 ? _g : 0);
                reason = String((_j = (_h = body.reason) !== null && _h !== void 0 ? _h : body.status) !== null && _j !== void 0 ? _j : 'Allowed by SentinelMesh');
            }
            catch (error) {
                if (error instanceof n8n_workflow_1.NodeApiError) {
                    statusCode = error.httpCode ? Number(error.httpCode) : 500;
                    const body = ((_l = (_k = error.context) === null || _k === void 0 ? void 0 : _k.body) !== null && _l !== void 0 ? _l : {});
                    rawResponse = body;
                    if (statusCode === 403) {
                        decision = 'BLOCK';
                        riskScore = Number((_m = body.risk_score) !== null && _m !== void 0 ? _m : 90);
                        reason = String((_p = (_o = body.detail) !== null && _o !== void 0 ? _o : body.message) !== null && _p !== void 0 ? _p : 'Blocked by SentinelMesh security policy');
                    }
                    else {
                        // Keep auth token out of error metadata/log output.
                        error.context = {
                            ...((_q = error.context) !== null && _q !== void 0 ? _q : {}),
                            request: {
                                url: apiEndpoint,
                                method: 'POST',
                                headers: { ...headers, authorization: 'Bearer ***' },
                            },
                        };
                        throw error;
                    }
                }
                else {
                    throw error;
                }
            }
            const message = decision === 'BLOCK'
                ? `Blocked by SentinelMesh (Risk: ${riskScore})`
                : `Allowed by SentinelMesh (Risk: ${riskScore})`;
            if (decision === 'BLOCK' && failOnBlock) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `${message}. ${reason}`, { itemIndex });
            }
            const output = {
                decision,
                risk_score: riskScore,
                reason,
                message,
                status_code: statusCode,
                integration_id: integrationId,
                action: actionName,
            };
            if (debugMode) {
                output.raw_response = rawResponse;
            }
            returnData.push({ json: output, pairedItem: { item: itemIndex } });
        }
        return [returnData];
    }
}
exports.SentinelMesh = SentinelMesh;
