import { Crown, Building, User } from 'lucide-react';

export type RoleType = 'parent_org_admin' | 'branch_admin' | 'staff';

interface RoleBadgeProps {
  roleType: RoleType;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showTooltip?: boolean;
}

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

const SIZE_STYLES = {
  sm: {
    container: 'px-2 py-0.5 text-xs',
    icon: 'h-3 w-3',
    gap: 'gap-1'
  },
  md: {
    container: 'px-2.5 py-1 text-sm',
    icon: 'h-4 w-4',
    gap: 'gap-1.5'
  },
  lg: {
    container: 'px-3 py-1.5 text-base',
    icon: 'h-5 w-5',
    gap: 'gap-2'
  }
};

export function RoleBadge({ 
  roleType, 
  size = 'md', 
  showIcon = true,
  showTooltip = true
}: RoleBadgeProps) {
  const style = ROLE_STYLES[roleType];
  const sizeStyle = SIZE_STYLES[size];
  const Icon = style.icon;

  const badge = (
    <div
      className={`
        inline-flex items-center ${sizeStyle.gap} ${sizeStyle.container}
        ${style.bg} ${style.text} border ${style.border}
        rounded-full font-medium
        transition-all duration-200
      `}
    >
      {showIcon && <Icon className={sizeStyle.icon} />}
      <span>{style.label}</span>
    </div>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <div className="group relative inline-block">
      {badge}
      {/* Tooltip */}
      <div className="
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        invisible group-hover:visible
        opacity-0 group-hover:opacity-100
        transition-all duration-200
        pointer-events-none
        z-50
      ">
        <div className="
          bg-gray-900 text-white text-xs rounded-lg
          px-3 py-2 whitespace-nowrap
          shadow-lg
        ">
          {style.description}
          {/* Arrow */}
          <div className="
            absolute top-full left-1/2 -translate-x-1/2
            border-4 border-transparent border-t-gray-900
          " />
        </div>
      </div>
    </div>
  );
}
