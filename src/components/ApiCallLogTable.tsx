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
                {title.toLowerCase().includes('apollo') ? (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Found Contacts
                  </th>
                ) : (
                  <>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Keyword
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                  </>
                )}
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
                  {title.toLowerCase().includes('apollo') ? (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.details?.foundContacts?.join(', ') ||
                        (log.metadata?.response?.person && `${log.metadata.response.person.name} (${log.metadata.response.person.title || 'N/A'})`) ||
                        'N/A'}
                    </td>
                  ) : (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.details?.keyword || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.details?.location || 'N/A'}
                      </td>
                    </>
                  )}
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