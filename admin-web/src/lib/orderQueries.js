import { callFunction } from './cloudbase.js';
import { getToken } from './session.js';

export async function fetchAllOrders({ status, scope = 'all' } = {}) {
  const pageSize = 100;
  const first = await callFunction('getOrders', {
    token: getToken(),
    status: status || undefined,
    scope,
    page: 1,
    pageSize
  });
  const list = [...(first.list || [])];
  const totalPages = Math.ceil((first.total || list.length) / pageSize);

  if (totalPages > 1) {
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => callFunction('getOrders', {
        token: getToken(),
        status: status || undefined,
        scope,
        page: index + 2,
        pageSize
      }))
    );
    remaining.forEach((result) => list.push(...(result.list || [])));
  }

  return list;
}
