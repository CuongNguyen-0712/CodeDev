import { apiClient } from '@/clients/api.client';

const id = (value) => encodeURIComponent(String(value));

// Reads of challenge state (docs/api-conventions.md: reads are GET, writes are server actions).
export const challengeClient = {
    getWorkspace: async (challengeId, config) => (await apiClient.get(`/challenges/${id(challengeId)}/workspace`, config)).data,

    getQuizState: async (challengeId, config) => (await apiClient.get(`/challenges/${id(challengeId)}/quiz`, config)).data,

    getSubmissions: async (challengeId, config) => (await apiClient.get(`/challenges/${id(challengeId)}/submissions`, config)).data,

    getSubmissionCode: async (challengeId, submissionId, config) =>
        (await apiClient.get(`/challenges/${id(challengeId)}/submissions/${id(submissionId)}`, config)).data,

    getCodeRun: async (runId, config) => (await apiClient.get(`/code-runs/${id(runId)}`, config)).data,
};
