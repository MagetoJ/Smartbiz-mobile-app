# Role Badge System Implementation

## Overview
Implemented a comprehensive role badge system that clearly distinguishes between Parent Organization Admins, Branch Admins, and Staff members throughout the UI. This works in tandem with backend permissions to provide visual clarity on user roles and access levels.

## Role Types

### 1. Parent Organization Admin 👑
- **Identifier:** `role_type = "parent_org_admin"`
- **Logic:** `isAdmin && !isBranchTenant`
- **Color:** Purple (bg-purple-100, text-purple-800)
- **Icon:** Crown
- **Permissions:**
  - ✅ Full edit rights across ALL branches
  - ✅ Can add/edit/delete products anywhere
  - ✅ Can receive stock for any branch
  - ✅ Manage organization settings
  - ✅ View all analytics and reports
  - ✅ Never sees read-only warnings

### 2. Branch Admin 🏢
- **Identifier:** `role_type = "branch_admin"`
- **Logic:** `isAdmin && isBranchTenant`
- **Color:** Blue (bg-blue-100, text-blue-800)
- **Icon:** Building
- **Permissions:**
  - ✅ Full control within their assigned branch
  - ❌ Read-only access to other branches
  - ⚠️ Sees warning when viewing other branches
  - ✅ Can manage branch-level settings
  - ✅ View branch-specific analytics

### 3. Staff Member 👤
- **Identifier:** `role_type = "staff"`
- **Logic:** `role === 'staff'`
- **Color:** Green (bg-green-100, text-green-800)
- **Icon:** User
- **Permissions:**
  - ✅ Can work within assigned branch
  - ❌ Cannot edit prices
  - ❌ Limited access to analytics
  - ❌ Read-only when viewing other branches
  - ✅ Can perform daily sales operations

## Implementation Details

### Backend Changes

**1. Schema Update (`backend/schemas.py`)**
```python
class UserWithRoleResponse(UserResponse):
    role: UserRole
    role_type: str  # NEW: "parent_org_admin" | "branch_admin" | "staff"
    tenant_is_active: bool
    joined_at: datetime
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
```

**2. Auth Endpoint Update (`backend/main.py` - Line ~345)**
```python
@app.get("/auth/me", response_model=UserWithRoleResponse)
async def get_me(...):
    # Compute role_type for frontend badge display
    role_type = "staff"  # Default
    if membership.role == UserRole.ADMIN:
        if current_tenant.parent_tenant_id is None:
            role_type = "parent_org_admin"
        else:
            role_type = "branch_admin"
    
    return {
        **current_user.__dict__,
        "role": membership.role,
        "role_type": role_type,  # NEW field
        ...
    }
```

### Frontend Changes

**1. User Interface Update (`frontend/src/contexts/AuthContext.tsx`)**
```typescript
interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  role_type: 'parent_org_admin' | 'branch_admin' | 'staff';  // NEW
  branch_id?: number | null;
  branch_name?: string | null;
}
```

**2. RoleBadge Component (`frontend/src/components/RoleBadge.tsx`)**
- NEW component with responsive sizing (sm, md, lg)
- Shows role-appropriate icon and color
- Includes hover tooltip with permission description
- Accessible and mobile-friendly design

**3. Layout Header Update (`frontend/src/components/Layout.tsx`)**
- Added RoleBadge display next to user name
- Shows on desktop (hidden on mobile for space)
- Positioned between welcome message and branch info

**4. Inventory Permissions (`frontend/src/pages/Inventory.tsx` - Line ~28)**
```typescript
// Parent organization admins have full rights across all branches
const isParentOrgAdmin = isAdmin && !isBranchTenant;
const isEditable = isParentOrgAdmin || !user?.branch_id || user.branch_id === selectedBranchId;
```

## Visual Design

### Badge Styles

```typescript
const ROLE_STYLES = {
  parent_org_admin: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-300',
    icon: Crown,
    label: 'Organization Admin',
    description: 'Full access across all branches and settings'
  },
  branch_admin: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
    icon: Building,
    label: 'Branch Admin',
    description: 'Manage your assigned branch location'
  },
  staff: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    icon: User,
    label: 'Staff Member',
    description: 'Daily operations and sales'
  }
};
```

### Size Variants

- **Small (`sm`)**: For compact spaces, headers, and mobile views
- **Medium (`md`)**: Default size for general use
- **Large (`lg`)**: For prominent displays and emphasis

## Usage Examples

### In Components
```typescript
import { RoleBadge } from '@/components/RoleBadge';

// Basic usage
<RoleBadge roleType={user.role_type} />

// Custom size
<RoleBadge roleType={user.role_type} size="sm" />

// Without icon
<RoleBadge roleType={user.role_type} showIcon={false} />

// Without tooltip
<RoleBadge roleType={user.role_type} showTooltip={false} />
```

### Access Control Patterns
```typescript
// Check if user is parent org admin
const isParentOrgAdmin = user?.role_type === 'parent_org_admin';

// Grant full rights to parent org admins
const canEdit = isParentOrgAdmin || (condition for other users);

// Role-specific UI logic
{user?.role_type === 'parent_org_admin' && (
  <AdvancedFeatures />
)}
```

## Benefits

1. **Instant Visual Clarity**
   - Users immediately understand their permission level
   - No confusion about why certain features are restricted

2. **Improved UX**
   - Color-coded badges are easy to scan
   - Tooltips provide detailed explanations
   - Consistent visual language throughout app

3. **Security Awareness**
   - Users understand their role boundaries
   - Clear distinction between admin types
   - Reduces support requests

4. **Professional Appearance**
   - Modern badge design
   - Smooth animations and transitions
   - Mobile-responsive

## Testing

### Test Scenarios

1. **Parent Org Admin Badge**
   ```
   - Login as admin from parent organization
   - Verify purple "Organization Admin" badge appears in header
   - Hover to see tooltip: "Full access across all branches and settings"
   - Verify no read-only warnings when switching branches
   - All edit buttons should be enabled
   ```

2. **Branch Admin Badge**
   ```
   - Login as admin from a branch tenant
   - Verify blue "Branch Admin" badge appears in header
   - Hover to see tooltip: "Manage your assigned branch location"
   - Switch to another branch - verify read-only warning appears
   - Edit buttons should be disabled for other branches
   ```

3. **Staff Badge**
   ```
   - Login as staff user
   - Verify green "Staff Member" badge appears in header
   - Hover to see tooltip: "Daily operations and sales"
   - Verify appropriate restrictions (cannot edit prices, etc.)
   - Read-only mode when viewing other branches
   ```

## Future Enhancements

### Potential Additional Locations for Badges

1. **Inventory Page** - Context awareness below page title
2. **Dashboard** - Welcome section with role indicator
3. **Mobile Navigation** - User menu drawer
4. **User Profile/Settings** - Prominent role display
5. **Users Management Page** - Show role type for each user in list

### Additional Role Types (If Needed)

- `org_viewer`: Read-only organization access
- `regional_manager`: Multi-branch management (subset)
- `accountant`: Financial data only

## Files Modified

### Backend
1. `backend/schemas.py` - Added `role_type` field to UserWithRoleResponse
2. `backend/main.py` - Updated `/auth/me` endpoint to compute role_type

### Frontend
1. `frontend/src/contexts/AuthContext.tsx` - Added role_type to User interface
2. `frontend/src/components/RoleBadge.tsx` - NEW: Role badge component
3. `frontend/src/components/Layout.tsx` - Added badge to header
4. `frontend/src/pages/Inventory.tsx` - Updated isEditable logic for parent org admins

## Implementation Date
January 14, 2026

## Related Documentation
- `PARENT_ORG_ADMIN_RIGHTS.md` - Parent org admin permissions implementation
- `MULTI_TENANT_GUIDE.md` - Multi-tenant architecture overview
- `SECURITY.md` - Security and access control guidelines
