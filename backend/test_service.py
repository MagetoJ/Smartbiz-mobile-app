"""
Test script to verify service product functionality
"""
import requests
import json

BASE_URL = "http://localhost:8000"

# Login
print("=== LOGIN ===")
login_response = requests.post(
    f"{BASE_URL}/auth/login",
    json={
        "username": "admin",
        "password": "admin123",
        "subdomain": "demo"
    }
)
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"✓ Logged in successfully")

# Get the service product
print("\n=== GET SERVICE PRODUCT ===")
products_response = requests.get(f"{BASE_URL}/products", headers=headers)
products = products_response.json()
service_product = None
for p in products:
    if p.get("sku") == "SPA-002":
        service_product = p
        break

if service_product:
    print(f"✓ Service Product Found:")
    print(f"  - Name: {service_product['name']}")
    print(f"  - SKU: {service_product['sku']}")
    print(f"  - ID: {service_product['id']}")
    print(f"  - is_service: {service_product['is_service']}")
    print(f"  - Quantity: {service_product['quantity']}")
    print(f"  - Unit: {service_product['unit']}")
else:
    print("✗ Service product not found!")
    exit(1)

# Get a physical product for mixed sale
physical_product = None
for p in products:
    if not p['is_service'] and p['quantity'] > 0:
        physical_product = p
        break

print(f"\n✓ Physical Product Found: {physical_product['name']} (Quantity: {physical_product['quantity']})")

# Create sale with service only
print("\n=== CREATE SALE WITH SERVICE ONLY ===")
sale_response = requests.post(
    f"{BASE_URL}/sales",
    headers=headers,
    json={
        "customer_name": "Test Customer 1",
        "payment_method": "cash",
        "notes": "Service-only sale",
        "items": [
            {"product_id": service_product['id'], "quantity": 3}
        ]
    }
)
if sale_response.status_code == 201:
    sale = sale_response.json()
    print(f"✓ Sale created: ID {sale['id']}, Total: {sale['total']}")
else:
    print(f"✗ Sale failed: {sale_response.text}")

# Verify service stock is still 0
print("\n=== VERIFY SERVICE STOCK NOT DEDUCTED ===")
products_response = requests.get(f"{BASE_URL}/products", headers=headers)
products = products_response.json()
for p in products:
    if p.get("sku") == "SPA-002":
        print(f"Service Product Quantity: {p['quantity']} (Expected: 0)")
        if p['quantity'] == 0:
            print("✓ PASS: Stock not deducted for service")
        else:
            print("✗ FAIL: Stock was deducted for service!")
        break

# Create mixed sale (service + physical product)
print("\n=== CREATE MIXED SALE (Service + Physical Product) ===")
original_physical_qty = physical_product['quantity']
sale_response = requests.post(
    f"{BASE_URL}/sales",
    headers=headers,
    json={
        "customer_name": "Test Customer 2",
        "payment_method": "credit_card",
        "notes": "Mixed sale test",
        "items": [
            {"product_id": service_product['id'], "quantity": 2},
            {"product_id": physical_product['id'], "quantity": 1}
        ]
    }
)
if sale_response.status_code == 201:
    sale = sale_response.json()
    print(f"✓ Mixed sale created: ID {sale['id']}, Total: {sale['total']}")
    print(f"  Items in sale:")
    for item in sale['sale_items']:
        print(f"    - {item['product']['name']} x{item['quantity']}")
else:
    print(f"✗ Mixed sale failed: {sale_response.text}")

# Verify stocks after mixed sale
print("\n=== VERIFY STOCKS AFTER MIXED SALE ===")
products_response = requests.get(f"{BASE_URL}/products", headers=headers)
products = products_response.json()
for p in products:
    if p.get("sku") == "SPA-002":
        print(f"Service: {p['name']}")
        print(f"  Quantity: {p['quantity']} (Expected: 0 - no change)")
        if p['quantity'] == 0:
            print("  ✓ PASS")
        else:
            print("  ✗ FAIL")
    elif p['id'] == physical_product['id']:
        expected_qty = original_physical_qty - 1
        print(f"Physical: {p['name']}")
        print(f"  Quantity: {p['quantity']} (Expected: {expected_qty})")
        if p['quantity'] == expected_qty:
            print("  ✓ PASS")
        else:
            print("  ✗ FAIL")

print("\n=== ALL TESTS COMPLETED ===")
