import React, { useState } from 'react';
import { X, Mail, Loader2, Paperclip } from 'lucide-react';

interface Business {
  id: string;
  name: string;
  website: string | null;
  emails: string[];
  auditReport?: any;
}

interface EmailModalProps {
  business: Business;
  isOpen: boolean;
  onClose: () => void;
  onEmailSent: (businessId: string) => void;
}

const EmailModal: React.FC<EmailModalProps> = ({ business, isOpen, onClose, onEmailSent }) => {
  const [selectedEmail, setSelectedEmail] = useState(business.emails[0] || '');
  const [subject, setSubject] = useState(`Free Business Audit Report for ${business.name}`);
  const [message, setMessage] = useState(`Hi there,

I hope this email finds you well. I recently came across ${business.name} and was impressed by your business.

I've prepared a complimentary business audit report that highlights some opportunities for growth and improvement. The report is attached to this email.

Key findings include:
• Website optimization opportunities
• Local SEO improvements
• Customer engagement strategies

I'd love to discuss how we can help you implement these recommendations to drive more customers to your business.

Would you be interested in a brief 15-minute call this week to go over the findings?

Best regards,
Your Marketing Team`);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!selectedEmail.trim() || !subject.trim() || !message.trim()) return;

    setIsSending(true);

    try {
      const response = await fetch(`http://localhost:3001/api/send-email/${business.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: selectedEmail,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      if (response.ok) {
        onEmailSent(business.id);
        onClose();
      }
    } catch (error) {
      console.error('Failed to send email:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Send Outreach Email</h3>
              <p className="text-sm text-gray-600">to {business.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto space-y-4">
          {/* Email Selection */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Send to
            </label>
            <select
              id="email"
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {business.emails.map((email, index) => (
                <option key={index} value={email}>{email}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Attachment Info */}
          {business.auditReport && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-sm text-blue-800">
                <Paperclip className="h-4 w-4" />
                <span>Audit report will be attached: {business.name.replace(/\s+/g, '_')}_audit_report.pdf</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !selectedEmail.trim() || !subject.trim() || !message.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                <span>Send Email</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailModal;