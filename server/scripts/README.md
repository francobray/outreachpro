# Database Initialization Scripts

This directory contains scripts for initializing the database with default data when deploying to a new environment.

## Email Templates Initialization

### Usage

```bash
# From the project root
npm run init-db

# Or directly
node server/scripts/init-database.js
```

### What it does

The `init-database.js` script will:

1. **Connect to MongoDB** using the `MONGODB_URI` environment variable
2. **Check for existing templates** - if templates already exist, it will skip initialization
3. **Create 3 default email templates**:
   - **Business Audit Outreach** (Default template)
   - **Unlock Hidden Revenue**
   - **Competitive Search Analysis**

### Default Templates

#### 1. Business Audit Outreach (Default)
- **Subject**: "Free Business Audit Report for {{BUSINESS_NAME}}"
- **Category**: outreach
- **Variables**: LEAD_NAME, BUSINESS_NAME, BUSINESS_CITY_STATE, AUDIT_SCORE

#### 2. Unlock Hidden Revenue
- **Subject**: "Is {{BUSINESS_NAME}} losing {{REVENUE_LOSS}} each month?"
- **Category**: revenue
- **Variables**: LEAD_NAME, BUSINESS_NAME, BUSINESS_CITY_STATE, REVENUE_LOSS

#### 3. Competitive Search Analysis
- **Subject**: "How {{BUSINESS_NAME}} can outrank local competitors"
- **Category**: competitive
- **Variables**: LEAD_NAME, BUSINESS_NAME, BUSINESS_CITY_STATE, COMPETITOR_LIST

### Environment Requirements

Make sure your `.env` file contains:
```
MONGODB_URI=your_mongodb_connection_string
```

### Safety Features

- **Idempotent**: Won't create duplicate templates if they already exist
- **Error handling**: Proper error messages and graceful failure
- **Connection cleanup**: Always disconnects from MongoDB when done

### Reinitializing

If you need to reinitialize the database:

1. **Clear existing templates** from the database
2. **Run the script again**: `npm run init-db`

### Deployment Usage

When deploying to a new environment:

1. **Set up MongoDB** and configure `MONGODB_URI`
2. **Run the initialization**: `npm run init-db`
3. **Start the application**: `npm run server`

The application will now have the default email templates ready to use. 