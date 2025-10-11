# Admin Role Documentation

## Overview
The **Admin** role has been created with full system access, including permissions to manage users, roles, and system settings.

## Admin Role Permissions

The Admin role includes the following permissions:

### Inventory Permissions
- `inventory.view` - View inventory items
- `inventory.create` - Create new inventory items
- `inventory.edit` - Edit existing inventory items
- `inventory.delete` - Delete inventory items

### Finance Permissions
- `finance.view` - View financial records
- `finance.create` - Create invoices, bills, payments
- `finance.edit` - Edit financial records
- `finance.delete` - Delete financial records

### Reports Permissions
- `reports.view` - View all reports
- `reports.export` - Export reports

### User Management Permissions
- `users.view` - View all users
- `users.create` - Create new users
- `users.edit` - Edit user profiles and assign roles
- `users.delete` - Delete/deactivate users

### Role Management Permissions
- `roles.view` - View all roles
- `roles.create` - Create new roles
- `roles.edit` - Edit role permissions
- `roles.delete` - Delete roles

### Settings Management Permissions
- `settings.view` - View system settings
- `settings.edit` - Edit system settings

## Default Admin User

A default admin user has been created with the following credentials:

- **Username**: `admin`
- **Password**: `admin123`
- **Role**: Admin
- **Email**: admin@company.com

⚠️ **IMPORTANT**: Please change the default password after first login for security purposes.

## Other Roles

### Financial + Inventory Operator
This role has access to inventory and finance modules but cannot:
- Manage users
- Manage roles
- Edit system settings (can only view)

**Permissions**:
- All inventory permissions (view, create, edit, delete)
- All finance permissions (view, create, edit, delete)
- Reports (view, export)
- **Settings**: view only (cannot edit)

### Inventory Operator
This role has access to inventory module only.

**Permissions**:
- inventory.view
- inventory.create
- inventory.edit
- reports.view
- **Settings**: view only (cannot edit)

## Permission System

The permission system uses a dot notation for granular access control:
- Format: `module.action`
- Example: `users.edit`, `settings.view`

### Backend Protection
Routes are protected using the `hasPermission` middleware:

```javascript
router.put('/', hasPermission(['settings.edit']), updateSettings);
```

### Frontend Protection
The frontend uses the `hasPermission` function from `authStore`:

```javascript
{hasPermission('users.create') && (
  <Button onClick={createUser}>Create User</Button>
)}
```

## Security Considerations

1. **Settings Access**:
   - Only admins can **edit** settings
   - All authenticated users can **view** settings
   - Non-admin roles cannot modify any settings

2. **User Management**:
   - Only admins can create, edit, or delete users
   - Non-admin roles cannot see the Users page
   - Users **cannot edit their own profiles** - only admins can edit user profiles

3. **Role Management**:
   - Only admins can view and manage roles
   - Non-admin roles cannot access role information

4. **Profile Viewing**:
   - All users can view their own profile information
   - Users cannot edit their own profiles - only admins can make changes

5. **Audit Trail**: All user and role changes should be logged for security auditing

## Running the Seed

To create or update roles in the database, run:

```bash
cd backend
npm run db:seed
```

This will:
1. Create/update the Admin role
2. Create/update other roles (Inventory Operator, Financial + Inventory Operator)
3. Create the default admin user
4. Seed initial product categories, companies, and warehouse

## Admin Capabilities

As an Admin, you can:

✅ **Manage Users**
- Create new user accounts
- Edit user profiles (name, email, phone)
- Change user roles
- Activate/deactivate users
- Reset user passwords
- Delete users

✅ **Manage Roles**
- View all roles and their permissions
- Create custom roles (future feature)
- Edit role permissions (future feature)
- Assign roles to users

✅ **Manage Settings**
- Configure company information
- Set default payment terms
- Configure tax rates
- Set opening cash balance
- Manage notification preferences
- Configure inventory thresholds

✅ **Full Access to All Modules**
- Complete access to inventory management
- Complete access to finance management
- Complete access to reports and analytics

## API Endpoints Protected

### Settings Endpoints
- `GET /api/settings` - Requires `settings.view`
- `PUT /api/settings` - Requires `settings.edit`
- `GET /api/settings/export` - Requires `settings.view`
- `POST /api/settings/import` - Requires `settings.edit`
- `POST /api/settings/reset` - Requires `settings.edit`

### Role Endpoints
- `GET /api/roles` - Requires `roles.view`
- `GET /api/roles/:id` - Requires `roles.view`

### User Endpoints
- `GET /api/users` - Requires `users.view`
- `POST /api/users` - Requires `users.create`
- `PUT /api/users/:id` - Requires `users.edit`
- `DELETE /api/users/:id` - Requires `users.delete`

## Notes

- The Admin role is the highest privilege level in the system
- Admins have unrestricted access to all features
- Be careful when assigning the Admin role to users
- Regular audits of admin activities are recommended
