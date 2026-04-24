"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SentinelMeshApi = void 0;
class SentinelMeshApi {
    constructor() {
        this.name = 'sentinelMeshApi';
        this.displayName = 'SentinelMesh API';
        this.documentationUrl = 'https://github.com/sentinelmesh/sentinelmesh';
        this.properties = [
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
}
exports.SentinelMeshApi = SentinelMeshApi;
