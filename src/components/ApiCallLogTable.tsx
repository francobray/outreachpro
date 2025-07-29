import React from 'react';
import { ApiCallLog } from '../types';

interface ApiCallLogTableProps {
  logs: ApiCallLog[];
  title: string;
}

const ApiCallLogTable: React.FC<ApiCallLogTableProps> = ({ logs, title }) => {
  if (!logs || logs.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  API
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.api || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.details ? (
                      <>
                        {log.details.keyword && <span>Keyword: {log.details.keyword}</span>}
                        {log.details.location && <span className="ml-2">Location: {log.details.location}</span>}
                        {log.details.placeId && <span>Place ID: {log.details.placeId}</span>}
                        {log.details.businessName && <span>Business: {log.details.businessName}</span>}
                      </>
                    ) : 'No details'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ApiCallLogTable;