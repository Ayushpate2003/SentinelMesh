import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	NodeApiError,
	NodeOperationError,
	IDataObject,
} from 'n8n-workflow';

type SentinelDecision = 'ALLOW' | 'BLOCK' | 'QUEUE';

export class SentinelMesh implements INodeType {
	description: INodeTypeDescription = {
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('sentinelMeshApi');
		const baseUrl = String(credentials.baseUrl ?? '').trim();
		const token = String(credentials.token ?? '');
		if (!/^https?:\/\//i.test(baseUrl)) {
			throw new NodeOperationError(this.getNode(), 'SentinelMesh base URL must start with http:// or https://');
		}
		if (!token) {
			throw new NodeOperationError(this.getNode(), 'SentinelMesh integration token is required');
		}
		const apiEndpoint = `${baseUrl.replace(/\/+$/, '')}/api/v1/events`;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const integrationId = this.getNodeParameter('integrationId', itemIndex) as string;
			const actionName = this.getNodeParameter('actionName', itemIndex) as string;
			const payloadInput = this.getNodeParameter('payload', itemIndex) as unknown;
			const failOnBlock = this.getNodeParameter('failOnBlock', itemIndex, true) as boolean;
			const debugMode = this.getNodeParameter('debugMode', itemIndex, false) as boolean;

			const headers: Record<string, string> = {
				'content-type': 'application/json',
				accept: 'application/json',
				authorization: `Bearer ${token}`,
			};

			const metadata =
				typeof payloadInput === 'string'
					? JSON.parse(payloadInput)
					: (payloadInput ?? {});

			let decision: SentinelDecision = 'ALLOW';
			let riskScore = 0;
			let reason = 'Allowed by SentinelMesh';
			let rawResponse: IDataObject | string | number | boolean | null = null;
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

				statusCode = response.statusCode ?? 200;
				rawResponse = (response.body ?? null) as IDataObject | string | number | boolean | null;
				const body = (response.body ?? {}) as Record<string, unknown>;
				decision = (body.decision as SentinelDecision) ?? 'ALLOW';
				riskScore = Number(body.risk_score ?? 0);
				reason = String(body.reason ?? body.status ?? 'Allowed by SentinelMesh');
			} catch (error) {
				if (error instanceof NodeApiError) {
					statusCode = error.httpCode ? Number(error.httpCode) : 500;
					const body = (error.context?.body ?? {}) as Record<string, unknown>;
					rawResponse = body as IDataObject;
					if (statusCode === 403) {
						decision = 'BLOCK';
						riskScore = Number(body.risk_score ?? 90);
						reason = String(body.detail ?? body.message ?? 'Blocked by SentinelMesh security policy');
					} else {
						// Keep auth token out of error metadata/log output.
						error.context = {
							...(error.context ?? {}),
							request: {
								url: apiEndpoint,
								method: 'POST',
								headers: { ...headers, authorization: 'Bearer ***' },
							},
						};
						throw error;
					}
				} else {
					throw error;
				}
			}

			const message =
				decision === 'BLOCK'
					? `Blocked by SentinelMesh (Risk: ${riskScore})`
					: `Allowed by SentinelMesh (Risk: ${riskScore})`;

			if (decision === 'BLOCK' && failOnBlock) {
				throw new NodeOperationError(
					this.getNode(),
					`${message}. ${reason}`,
					{ itemIndex },
				);
			}

			const output: IDataObject = {
				decision,
				risk_score: riskScore,
				reason,
				message,
				status_code: statusCode,
				integration_id: integrationId,
				action: actionName,
			};
			if (debugMode) {
				output.raw_response = rawResponse as any;
			}

			returnData.push({ json: output, pairedItem: { item: itemIndex } });
		}

		return [returnData];
	}
}
