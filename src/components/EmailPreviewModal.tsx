import React from 'react';
import { X } from 'lucide-react';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  body: string;
}

const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({ isOpen, onClose, subject, body }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Email Preview</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <strong className="text-sm font-medium text-gray-900">Subject:</strong>
            <p className="text-sm text-gray-700">{subject}</p>
          </div>
          <div>
            <strong className="text-sm font-medium text-gray-900">Body:</strong>
            <div className="mt-2 p-4 border rounded-lg bg-gray-50 text-sm text-gray-800 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: body }} />
          </div>
        </div>
        <div className="flex items-center justify-end p-6 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailPreviewModal; 