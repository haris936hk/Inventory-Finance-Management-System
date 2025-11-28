# Error Message Mapper - Usage Guide

## Overview

The Error Message Mapper utility (`errorMessages.js`) provides a centralized, standardized way to handle and display error messages throughout the application. It automatically maps backend errors, HTTP status codes, and Prisma errors to user-friendly messages.

## Key Benefits

1. **Consistency**: All error messages follow the same format and tone
2. **User-Friendly**: Technical errors are translated to understandable language
3. **Context-Aware**: Provides specific messages based on the operation context
4. **Maintainable**: Update error messages in one place for the entire application
5. **Comprehensive**: Handles network errors, validation errors, database errors, and more

## Basic Usage

### Import the Utility

```javascript
import { getErrorMessage } from '../../utils/errorMessages';
```

### Simple Error Handling

```javascript
const mutation = useMutation(
  (data) => axios.post('/api/endpoint', data),
  {
    onError: (error) => {
      const errorMessage = getErrorMessage(error);
      message.error(errorMessage);
    }
  }
);
```

### Context-Aware Error Handling

```javascript
const customerMutation = useMutation(
  (data) => axios.post('/finance/customers', data),
  {
    onError: (error) => {
      // Provide context and operation for specific messages
      const errorMessage = getErrorMessage(error, 'customer', 'create');
      message.error(errorMessage);
    }
  }
);
```

## Available Contexts

The utility supports the following contexts with operation-specific messages:

### Finance Module
- **invoice**: create, update, delete, cancel, notFound, overCreditLimit, noItems, invalidStatus
- **payment**: create, void, overpayment, invalidAmount, alreadyPaid, notFound
- **customer**: create, update, delete, notFound, duplicatePhone, hasTransactions
- **bill**: create, update, cancel, notFound, exceedsPO, hasPayments, invalidAmount
- **purchaseOrder**: create, update, cancel, notFound, invalidStatus, hasBills, hasItems

### Inventory Module
- **vendor**: create, update, delete, notFound, duplicateCode, hasTransactions
- **item**: create, update, delete, notFound, alreadyReserved, alreadySold, invalidSerial, insufficientStock

### User Management
- **user**: create, update, delete, notFound, duplicateUsername, weakPassword

## Examples

### Example 1: Invoice Creation with Credit Limit Error

```javascript
// Backend returns: { status: 400, data: { type: 'OVER_CREDIT_LIMIT' } }
const errorMessage = getErrorMessage(error, 'invoice', 'create');
// Result: "Cannot create invoice. This would exceed the customer's credit limit."
```

### Example 2: Payment Overpayment Error

```javascript
// Backend returns InsufficientBalanceError:
// { error: { message: "Payment exceeds remaining balance", available: 1000, required: 1500 } }
const errorMessage = getErrorMessage(error, 'payment', 'create');
// Result: "Payment exceeds remaining balance. Available: PKR 1,000, Required: PKR 1,500"
```

### Example 3: Duplicate Phone Number

```javascript
// Backend returns: { status: 400, code: 'P2002', message: "Unique constraint failed on the fields: (`phone`)" }
const errorMessage = getErrorMessage(error, 'customer', 'create');
// Result: "A record with this phone number already exists. Please use a different phone number."
```

### Example 4: Network Error

```javascript
// No response from server
const errorMessage = getErrorMessage(error);
// Result: "Network error. Please check your connection and try again."
```

### Example 5: Concurrency Error

```javascript
// Backend returns: { status: 409 }
const errorMessage = getErrorMessage(error, 'invoice', 'update');
// Result: "This record is being modified by another user. Please refresh and try again."
```

## Error Type Checking Utilities

The utility also provides helper functions to check specific error types:

```javascript
import {
  isAuthError,
  isValidationError,
  isNotFoundError,
  isConcurrencyError,
  isNetworkError
} from '../../utils/errorMessages';

// Example: Redirect to login on auth errors
const mutation = useMutation(
  (data) => axios.post('/api/endpoint', data),
  {
    onError: (error) => {
      if (isAuthError(error)) {
        navigate('/login');
        return;
      }
      const errorMessage = getErrorMessage(error);
      message.error(errorMessage);
    }
  }
);
```

## Advanced Usage

### Handling Multiple Operations

```javascript
const customerMutation = useMutation(
  (data) => {
    if (editingCustomer) {
      return axios.put(`/finance/customers/${editingCustomer.id}`, data);
    }
    return axios.post('/finance/customers', data);
  },
  {
    onError: (error) => {
      const operation = editingCustomer ? 'update' : 'create';
      const errorMessage = getErrorMessage(error, 'customer', operation);
      message.error(errorMessage);
    }
  }
);
```

### Validation Error Extraction

```javascript
import { getValidationErrors } from '../../utils/errorMessages';

const handleFormValidationError = (validationErrors) => {
  const messages = getValidationErrors(validationErrors);
  messages.forEach(msg => message.error(msg));
};
```

### Custom Fallback Messages

```javascript
const errorMessage = getErrorMessage(error, 'invoice', 'create') || 'An unexpected error occurred';
message.error(errorMessage);
```

## Migration Guide

### Before (Old Pattern)

```javascript
onError: (error) => {
  console.error('Operation failed:', error);
  const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
  message.error(errorMessage);
}
```

### After (New Pattern)

```javascript
onError: (error) => {
  const errorMessage = getErrorMessage(error, 'customer', 'create');
  message.error(errorMessage);
}
```

## Error Types Reference

### HTTP Status Codes
- **400**: Invalid request
- **401**: Not authorized
- **403**: Forbidden
- **404**: Not found
- **409**: Conflict (concurrency error)
- **422**: Validation failed
- **500**: Internal server error

### Backend Error Types
- `VALIDATION_ERROR`: Input validation failed
- `INSUFFICIENT_BALANCE`: Insufficient balance for operation
- `CONCURRENCY_ERROR`: Record being modified by another user
- `DUPLICATE_ENTRY`: Record already exists
- `INVALID_STATUS`: Cannot perform action in current status
- `OVER_CREDIT_LIMIT`: Would exceed credit limit

### Prisma Error Codes
- `P2002`: Unique constraint violation
- `P2003`: Foreign key constraint violation
- `P2025`: Record not found
- `P1001`: Database connection failed

## Best Practices

1. **Always provide context when available**: `getErrorMessage(error, 'invoice', 'create')`
2. **Use specific operations**: Instead of generic messages, specify 'create', 'update', 'delete', etc.
3. **Don't suppress errors**: Always display error messages to users
4. **Log for debugging**: Use `console.error()` in development for detailed error info
5. **Handle auth errors specially**: Redirect to login on 401 errors
6. **Test error scenarios**: Ensure error messages are clear and actionable

## Extending the Utility

### Adding New Contexts

Edit `errorMessages.js` and add to `CONTEXT_MESSAGES`:

```javascript
const CONTEXT_MESSAGES = {
  // ... existing contexts
  newContext: {
    create: 'Failed to create new item. Please try again.',
    update: 'Failed to update new item. Please try again.',
    delete: 'Cannot delete new item. It may be in use.',
    notFound: 'New item not found.'
  }
};
```

### Adding New Error Types

Add to `ERROR_TYPE_MESSAGES`:

```javascript
const ERROR_TYPE_MESSAGES = {
  // ... existing types
  NEW_ERROR_TYPE: 'User-friendly message for new error type.'
};
```

## Testing Error Messages

```javascript
// Test in browser console
import { getErrorMessage } from './utils/errorMessages';

// Simulate 404 error
const error404 = { response: { status: 404 } };
console.log(getErrorMessage(error404));
// Output: "The requested resource was not found."

// Simulate validation error with context
const validationError = {
  response: {
    status: 400,
    data: { type: 'VALIDATION_ERROR' }
  }
};
console.log(getErrorMessage(validationError, 'customer', 'create'));
// Output: "Failed to create customer. The phone number may already be in use."
```

## Common Patterns

### Pattern 1: Simple CRUD Operations

```javascript
const { mutate } = useMutation(
  (data) => axios.post('/api/resource', data),
  {
    onSuccess: () => message.success('Operation successful'),
    onError: (error) => {
      const errorMessage = getErrorMessage(error, 'resource', 'create');
      message.error(errorMessage);
    }
  }
);
```

### Pattern 2: Create/Update Toggle

```javascript
const { mutate } = useMutation(
  (data) => isEditing
    ? axios.put(`/api/resource/${id}`, data)
    : axios.post('/api/resource', data),
  {
    onSuccess: () => message.success(isEditing ? 'Updated' : 'Created'),
    onError: (error) => {
      const operation = isEditing ? 'update' : 'create';
      const errorMessage = getErrorMessage(error, 'resource', operation);
      message.error(errorMessage);
    }
  }
);
```

### Pattern 3: Delete with Confirmation

```javascript
const handleDelete = (id) => {
  Modal.confirm({
    title: 'Delete Item',
    content: 'Are you sure?',
    onOk: async () => {
      try {
        await axios.delete(`/api/resource/${id}`);
        message.success('Deleted successfully');
      } catch (error) {
        const errorMessage = getErrorMessage(error, 'resource', 'delete');
        message.error(errorMessage);
      }
    }
  });
};
```

## Troubleshooting

### Error messages are too generic
**Solution**: Provide context and operation parameters:
```javascript
getErrorMessage(error, 'invoice', 'create'); // Good
getErrorMessage(error); // Generic
```

### Custom backend errors not mapping
**Solution**: Add the error type to `ERROR_TYPE_MESSAGES` or ensure backend returns standard format

### InsufficientBalanceError not showing amounts
**Solution**: Ensure backend returns the error in the correct format:
```javascript
{
  error: {
    message: "...",
    available: 1000,
    required: 1500
  }
}
```

## Support

For questions or issues with the error message mapper utility, please:
1. Check this guide for common patterns
2. Review the `errorMessages.js` source code
3. Contact the development team

---

**Last Updated**: 2025-01-25
**Version**: 1.0.0
