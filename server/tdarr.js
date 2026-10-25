import { api } from './lib.js';

// Tdarr's server API (default port 8265). The API key is optional in Tdarr; when set it goes in x-api-key.
// Everything here is read-only for now: libraries, flows and nodes. Changing a library's flow comes later.
// Tdarr keeps its settings in database collections that are read through POST /api/v2/cruddb.
const crud = (svc, collection, mode = 'getAll', extra = {}) =>
  api(svc, '/api/v2/cruddb', { method: 'POST', body: { data: { collection, mode, ...extra } } });

export const tdarrStatus = (svc) => api(svc, '/api/v2/status');

// A library is where Tdarr watches for files; flowId is the flow every file in it goes through (empty when it uses classic plugins).
export async function tdarrLibraries(svc) {
  const list = await crud(svc, 'LibrarySettingsJSONDB');
  return (Array.isArray(list) ? list : []).map((l) => ({
    id: l._id, name: l.name, folder: l.folder, flowId: l.flowId || '', hasFlow: !!l.flowId, priority: l.priority ?? 0,
  }));
}

export async function tdarrFlows(svc) {
  const list = await crud(svc, 'FlowsJSONDB');
  return (Array.isArray(list) ? list : []).map((f) => ({ id: f._id, name: f.name, description: f.description || '', steps: (f.flowPlugins || []).length }));
}

export async function tdarrNodes(svc) {
  const nodes = await api(svc, '/api/v2/get-nodes');
  return Object.values(nodes || {}).map((n) => ({ id: n._id, name: n.nodeName, paused: !!n.nodePaused }));
}

export async function testTdarr(svc) {
  const s = await tdarrStatus(svc);
  const [libs, flows] = await Promise.all([tdarrLibraries(svc).catch(() => []), tdarrFlows(svc).catch(() => [])]);
  return `Tdarr ${s.version || s.tdarrVersion || ''}, ${libs.length} libraries, ${flows.length} flows`.replace('Tdarr ,', 'Tdarr,');
}
