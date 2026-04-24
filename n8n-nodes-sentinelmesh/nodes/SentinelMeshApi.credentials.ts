import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class SentinelMeshApi implements ICredentialType {
	name = 'sentinelMeshApi';

	displayName = 'SentinelMesh API';

	documentationUrl = 'https://github.com/sentinelmesh/sentinelmesh';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:8002',
			placeholder: 'http://localhost:8002',
			description: 'Base URL of your SentinelMesh backend',
			required: true,
		},
		{
			displayName: 'Integration Token',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Integration token used as Bearer auth',
			required: true,
		},
	];
}
