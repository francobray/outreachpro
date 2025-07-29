import React, { useMemo, useState } from 'react';
import { ApiCallLog } from '../types';

interface ApiCallLogTableProps {
  logs: ApiCallLog[];
  title: string;
}

const ApiCallLogTable: React.FC<ApiCallLogTableProps> = ({ logs, title }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const displayItems = useMemo(() => {
    if (!logs || logs.length === 0) {
      return [];
    }

    const groupedByPlaceId = logs.reduce((acc, log) => {
      const placeId = log.details?.placeId || log.metadata?.request?.placeId;
      if (placeId && log.api === 'apollo_person_match') {
        if (!acc[placeId]) {
          acc[placeId] = [];
        }
        acc[placeId].push(log);
      } else {
        // Use log._id for ungrouped items to ensure unique key
        acc[log._id] = [log];
      }
      return acc;
    }, {} as Record<string, ApiCallLog[]>);

    return Object.values(groupedByPlaceId);
  }, [logs]);

  if (displayItems.length === 0) {
    return null;
  }

  const totalPages = Math.ceil(displayItems.length / pageSize);
  const paginatedItems = displayItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
                  <>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Organization
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Found Contacts
                    </th>
                  </>
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
              {paginatedItems.map((logGroup) => {
                const firstLog = logGroup[0];
                const placeId = firstLog.details?.placeId || firstLog.metadata?.request?.placeId;
                const isGrouped = logGroup.length > 1 && firstLog.api === 'apollo_person_match' && placeId;

                return (
                  <tr key={isGrouped ? placeId : firstLog._id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(firstLog.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {firstLog.api || 'N/A'}
                    </td>
                    {title.toLowerCase().includes('apollo') ? (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(() => {
                            const name = firstLog.details?.organizationName || firstLog.metadata?.response?.person?.organization?.name;
                            const website = firstLog.details?.organizationWebsite || firstLog.metadata?.response?.person?.organization?.website_url;
                            if (website) {
                              return (
                                <a href={website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  {name || 'N/A'}
                                </a>
                              );
                            }
                            return name || 'N/A';
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {logGroup.map((log) => (
                            <div key={log._id}>
                              {log.details?.foundContacts && log.details.foundContacts.length > 0
                                ? log.details.foundContacts.map((contact, index) => (
                                    <div key={index}>
                                      {contact.linkedin_url ? (
                                        <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                          {contact.name}
                                        </a>
                                      ) : (
                                        contact.name
                                      )}
                                      {contact.title && ` (${contact.title})`}
                                    </div>
                                  ))
                                : log.metadata?.response?.person ? (
                                    <div>
                                      {log.metadata.response.person.linkedin_url ? (
                                        <a href={log.metadata.response.person.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                          {log.metadata.response.person.name}
                                        </a>
                                      ) : (
                                        log.metadata.response.person.name
                                      )}
                                      {log.metadata.response.person.title && ` (${log.metadata.response.person.title})`}
                                    </div>
                                  )
                                : 'N/A'}
                            </div>
                          ))}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {firstLog.details?.keyword || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {firstLog.details?.location || 'N/A'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, displayItems.length)}</span> of <span className="font-medium">{displayItems.length}</span> results
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value={15}>15 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiCallLogTable;