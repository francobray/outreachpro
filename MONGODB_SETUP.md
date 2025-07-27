# MongoDB Setup Guide

This guide will help you set up MongoDB for your OutreachPro application.

## Prerequisites

1. **Install MongoDB** (if not already installed):
   - **macOS**: `brew install mongodb-community`
   - **Windows**: Download from [MongoDB website](https://www.mongodb.com/try/download/community)
   - **Linux**: Follow [MongoDB installation guide](https://docs.mongodb.com/manual/administration/install-on-linux/)

2. **Start MongoDB service**:
   - **macOS**: `brew services start mongodb-community`
   - **Windows**: MongoDB runs as a service automatically
   - **Linux**: `sudo systemctl start mongod`

## Configuration

1. **Copy the environment file**:
   ```bash
   cp env.example .env
   ```

2. **Edit the `.env` file** with your MongoDB connection string:
   ```bash
   # For local MongoDB
   MONGODB_URI=mongodb://localhost:27017/outreachpro
   
   # For MongoDB Atlas (cloud)
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/outreachpro
   ```

## Database Structure

The application uses two main collections:

### Businesses Collection
- Stores business information from Google Places API
- Includes audit reports, email data, and location information
- Indexed for fast queries by `placeId` and `name`

### Campaigns Collection
- Stores email campaign data
- Tracks campaign status and email delivery
- Includes email templates and target business lists

## Features Added

1. **Persistent Storage**: All business data is now stored in MongoDB instead of memory
2. **Campaign Management**: New campaign model for tracking email campaigns
3. **Better Performance**: Database indexes for faster queries
4. **Data Integrity**: Proper validation and error handling
5. **Scalability**: Can handle larger datasets without memory constraints

## API Changes

The following endpoints now use MongoDB:

- `POST /api/search` - Saves businesses to database
- `POST /api/audit/:businessId` - Updates audit reports in database
- `POST /api/emails/:businessId` - Saves email data to database
- `GET /api/dashboard` - Retrieves businesses from database
- `DELETE /api/clear` - Clears all data from database

## Testing the Setup

1. **Start the server**:
   ```bash
   npm run server
   ```

2. **Check MongoDB connection**:
   - Look for `[MongoDB] Connected to database` in the console
   - If you see connection errors, ensure MongoDB is running

3. **Test the API**:
   - Search for businesses using the frontend
   - Check that data persists between server restarts

## Troubleshooting

### Connection Issues
- Ensure MongoDB is running: `brew services list | grep mongodb`
- Check connection string in `.env` file
- Verify MongoDB port (default: 27017)

### Database Access
- Use MongoDB Compass for visual database management
- Or use MongoDB shell: `mongosh outreachpro`

### Data Migration
- Existing in-memory data will be lost on first run
- New searches will populate the database
- Use the clear endpoint to reset data: `DELETE /api/clear`

## Next Steps

1. **Set up MongoDB Atlas** (optional):
   - Create free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Update connection string in `.env`
   - Enable network access for your IP

2. **Add authentication** (optional):
   - Configure MongoDB authentication
   - Update connection string with credentials

3. **Backup strategy**:
   - Set up regular database backups
   - Consider MongoDB Atlas for automatic backups 