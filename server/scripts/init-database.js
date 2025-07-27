import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
const EmailTemplate = await import('../models/EmailTemplate.js').then(m => m.default);

const defaultTemplates = [
  {
    name: 'Business Audit Outreach',
    subject: 'Free Business Audit Report for {{BUSINESS_NAME}}',
    html: `Hi {{LEAD_NAME}},

I hope this email finds you well. I recently came across {{BUSINESS_NAME}} in {{BUSINESS_CITY_STATE}} and was impressed by your business.

I've prepared a complimentary business audit report that highlights some opportunities for growth and improvement. Based on my analysis, your business scored {{AUDIT_SCORE}}/100, which shows great potential with some strategic improvements.

Key findings include:
• Website optimization opportunities
• Local SEO improvements  
• Customer engagement strategies

I'd love to discuss how we can help you implement these recommendations to drive more customers to your business.

Would you be interested in a brief 15-minute call this week to go over the findings?

Best regards,
[Your Name]`,
    text: `Hi {{LEAD_NAME}},

I hope this email finds you well. I recently came across {{BUSINESS_NAME}} in {{BUSINESS_CITY_STATE}} and was impressed by your business.

I've prepared a complimentary business audit report that highlights some opportunities for growth and improvement. Based on my analysis, your business scored {{AUDIT_SCORE}}/100, which shows great potential with some strategic improvements.

Key findings include:
• Website optimization opportunities
• Local SEO improvements  
• Customer engagement strategies

I'd love to discuss how we can help you implement these recommendations to drive more customers to your business.

Would you be interested in a brief 15-minute call this week to go over the findings?

Best regards,
[Your Name]`,
    category: 'outreach',
    isDefault: true,
    variables: [
      {
        name: 'LEAD_NAME',
        description: 'The name of the business owner or decision maker',
        defaultValue: 'John Doe'
      },
      {
        name: 'BUSINESS_NAME',
        description: 'The name of the business from the search results',
        defaultValue: 'Temple Wynwood'
      },
      {
        name: 'BUSINESS_CITY_STATE',
        description: 'City and state where the business is located',
        defaultValue: 'Miami, FL'
      },
      {
        name: 'AUDIT_SCORE',
        description: 'Business audit report score out of 100',
        defaultValue: '87'
      }
    ]
  },
  {
    name: 'Unlock Hidden Revenue',
    subject: 'Is {{BUSINESS_NAME}} losing {{REVENUE_LOSS}} each month?',
    html: `Hi {{LEAD_NAME}},

I ran a quick digital health check for businesses in {{BUSINESS_CITY_STATE}} and discovered an opportunity for you.

My analysis shows that {{BUSINESS_NAME}} could be losing an estimated {{REVENUE_LOSS}} in potential revenue each month due to low visibility in Google search results. This happens when customers can't find you easily, and instead find your competitors.

I have a full report that pinpoints these issues. I'd be happy to walk you through it and show you how to improve your search ranking to capture that lost revenue.

Are you available for a brief chat next week?

Best regards,
[Your Name]`,
    text: `Hi {{LEAD_NAME}},

I ran a quick digital health check for businesses in {{BUSINESS_CITY_STATE}} and discovered an opportunity for you.

My analysis shows that {{BUSINESS_NAME}} could be losing an estimated {{REVENUE_LOSS}} in potential revenue each month due to low visibility in Google search results. This happens when customers can't find you easily, and instead find your competitors.

I have a full report that pinpoints these issues. I'd be happy to walk you through it and show you how to improve your search ranking to capture that lost revenue.

Are you available for a brief chat next week?

Best regards,
[Your Name]`,
    category: 'outreach',
    isDefault: false,
    variables: [
      {
        name: 'LEAD_NAME',
        description: 'The name of the business owner or decision maker',
        defaultValue: 'John Doe'
      },
      {
        name: 'BUSINESS_NAME',
        description: 'The name of the business from the search results',
        defaultValue: 'Temple Wynwood'
      },
      {
        name: 'BUSINESS_CITY_STATE',
        description: 'City and state where the business is located',
        defaultValue: 'Miami, FL'
      },
      {
        name: 'REVENUE_LOSS',
        description: 'Estimated potential revenue loss per month',
        defaultValue: '$7,950'
      }
    ]
  },
  {
    name: 'Competitive Search Analysis',
    subject: 'How {{BUSINESS_NAME}} can outrank local competitors',
    html: `Hi {{LEAD_NAME}},

I was looking at the competitive landscape for businesses like yours in {{BUSINESS_CITY_STATE}}, and I noticed something you should see.

Your business, {{BUSINESS_NAME}}, is currently being outranked on Google by several key competitors, including:
{{COMPETITOR_LIST}}

This means potential customers looking for your services are likely finding them first. The good news is that this is fixable.

I have a report that breaks down why you're being outranked and the specific steps you can take to claim a top spot.

Would you be open to a quick 15-minute call to review these insights?

Regards,
[Your Name]`,
    text: `Hi {{LEAD_NAME}},

I was looking at the competitive landscape for businesses like yours in {{BUSINESS_CITY_STATE}}, and I noticed something you should see.

Your business, {{BUSINESS_NAME}}, is currently being outranked on Google by several key competitors, including:
{{COMPETITOR_LIST}}

This means potential customers looking for your services are likely finding them first. The good news is that this is fixable.

I have a report that breaks down why you're being outranked and the specific steps you can take to claim a top spot.

Would you be open to a quick 15-minute call to review these insights?

Regards,
[Your Name]`,
    category: 'outreach',
    isDefault: false,
    variables: [
      {
        name: 'LEAD_NAME',
        description: 'The name of the business owner or decision maker',
        defaultValue: 'John Doe'
      },
      {
        name: 'BUSINESS_NAME',
        description: 'The name of the business from the search results',
        defaultValue: 'Temple Wynwood'
      },
      {
        name: 'BUSINESS_CITY_STATE',
        description: 'City and state where the business is located',
        defaultValue: 'Miami, FL'
      },
      {
        name: 'COMPETITOR_LIST',
        description: 'A list of top local competitors',
        defaultValue: '1. Pastis Miami, 2. Syndicate Wynwood'
      }
    ]
  }
];

async function initializeDatabase() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('❌ MONGODB_URI environment variable is not set');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB successfully');

    // Check if templates already exist
    const existingTemplates = await EmailTemplate.find({});
    
    if (existingTemplates.length > 0) {
      console.log(`⚠️  Found ${existingTemplates.length} existing templates. Skipping initialization.`);
      console.log('💡 To reinitialize, first clear the email_templates collection.');
      process.exit(0);
    }

    console.log('📝 Initializing default email templates...');

    // Create templates with proper IDs and timestamps
    const templatesToCreate = defaultTemplates.map((template, index) => ({
      id: `template-${Date.now()}-${index}`,
      name: template.name,
      subject: template.subject,
      html: template.html,
      text: template.text,
      category: template.category,
      isDefault: template.isDefault,
      variables: template.variables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    // Insert templates
    const createdTemplates = await EmailTemplate.insertMany(templatesToCreate);

    console.log(`✅ Successfully created ${createdTemplates.length} default email templates:`);
    createdTemplates.forEach(template => {
      console.log(`   • ${template.name} (${template.isDefault ? 'Default' : 'Standard'})`);
    });

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('📧 Email templates are now ready to use in the application.');

  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the initialization
initializeDatabase(); 