"""
Timezone utilities for tenant-aware date/time handling.

Converts UTC timestamps to tenant's local timezone for accurate date filtering.
Solves the issue where sales made at 1 AM Kenya time appear on the previous day
when grouped by UTC dates on Render deployment.
"""
from datetime import datetime, date, timedelta
from typing import Optional
import pytz


def get_tenant_timezone(tenant_timezone: str = "Africa/Nairobi") -> pytz.timezone:
    """
    Get pytz timezone object for tenant.
    
    Args:
        tenant_timezone: Timezone string (e.g., "Africa/Nairobi")
        
    Returns:
        pytz timezone object
    """
    try:
        return pytz.timezone(tenant_timezone)
    except pytz.exceptions.UnknownTimeZoneError:
        # Fallback to UTC if invalid timezone
        return pytz.UTC


def get_tenant_today(tenant_timezone: str = "Africa/Nairobi") -> date:
    """
    Get current date in tenant's timezone.
    
    This ensures "today" reflects the tenant's local time,
    not the server's UTC time.
    
    Args:
        tenant_timezone: Timezone string
        
    Returns:
        Current date in tenant's timezone
    """
    tz = get_tenant_timezone(tenant_timezone)
    utc_now = datetime.utcnow().replace(tzinfo=pytz.UTC)
    local_now = utc_now.astimezone(tz)
    return local_now.date()


def get_tenant_date_range(days: int, tenant_timezone: str = "Africa/Nairobi") -> tuple[datetime, datetime]:
    """
    Get date range in tenant's timezone.
    
    Returns UTC datetime objects that represent the start and end
    of the date range in the tenant's local timezone.
    
    Example:
        For Kenya (UTC+3), requesting "today" (days=1):
        - Returns: 21:00 previous day UTC to 20:59:59 today UTC
        - This captures all sales made "today" in Kenya time
    
    Args:
        days: Number of days to include (1 = today, 30 = last 30 days, etc.)
        tenant_timezone: Timezone string
        
    Returns:
        Tuple of (start_datetime_utc, end_datetime_utc)
    """
    tz = get_tenant_timezone(tenant_timezone)
    
    # Get current time in tenant's timezone
    utc_now = datetime.utcnow().replace(tzinfo=pytz.UTC)
    local_now = utc_now.astimezone(tz)
    
    # Get start of today in tenant's timezone
    local_today_start = tz.localize(datetime.combine(local_now.date(), datetime.min.time()))
    
    # Calculate start date (days ago)
    local_start = local_today_start - timedelta(days=days - 1)
    
    # End is end of today in tenant's timezone
    local_end = local_today_start + timedelta(days=1) - timedelta(microseconds=1)
    
    # Convert back to UTC for database queries
    start_utc = local_start.astimezone(pytz.UTC).replace(tzinfo=None)
    end_utc = local_end.astimezone(pytz.UTC).replace(tzinfo=None)
    
    return start_utc, end_utc


def utc_to_tenant_date(utc_datetime: datetime, tenant_timezone: str = "Africa/Nairobi") -> date:
    """
    Convert UTC datetime to date in tenant's timezone.
    
    Used for grouping sales by date in reports.
    
    Args:
        utc_datetime: UTC datetime (naive or aware)
        tenant_timezone: Timezone string
        
    Returns:
        Date in tenant's timezone
    """
    tz = get_tenant_timezone(tenant_timezone)
    
    # Ensure datetime is timezone-aware
    if utc_datetime.tzinfo is None:
        utc_datetime = utc_datetime.replace(tzinfo=pytz.UTC)
    
    # Convert to tenant's timezone
    local_datetime = utc_datetime.astimezone(tz)
    return local_datetime.date()


def format_tenant_datetime(utc_datetime: datetime, tenant_timezone: str = "Africa/Nairobi") -> str:
    """
    Format UTC datetime as string in tenant's timezone.
    
    Args:
        utc_datetime: UTC datetime
        tenant_timezone: Timezone string
        
    Returns:
        Formatted datetime string (e.g., "2026-01-26 14:30:00 EAT")
    """
    tz = get_tenant_timezone(tenant_timezone)
    
    if utc_datetime.tzinfo is None:
        utc_datetime = utc_datetime.replace(tzinfo=pytz.UTC)
    
    local_datetime = utc_datetime.astimezone(tz)
    return local_datetime.strftime("%Y-%m-%d %H:%M:%S %Z")
