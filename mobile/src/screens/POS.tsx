import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { database } from '../db';
import Product from '../db/models/Product';

const POS = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{product: Product, quantity: number}[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      const productCollection = database.get<Product>('products');
      const allProducts = await productCollection.query().fetch();
      setProducts(allProducts);
    };
    fetchProducts();
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id ? {...item, quantity: item.quantity + 1} : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mobile POS</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.productList}>
          <Text style={styles.sectionTitle}>Products</Text>
          <FlatList
            data={products}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        <View style={styles.cart}>
          <Text style={styles.sectionTitle}>Cart</Text>
          <FlatList
            data={cart}
            keyExtractor={item => item.product.id}
            renderItem={({ item }) => (
              <View style={styles.cartItem}>
                <Text>{item.product.name} x {item.quantity}</Text>
                <Text>${(item.product.price * item.quantity).toFixed(2)}</Text>
              </View>
            )}
          />
          <View style={styles.footer}>
            <Text style={styles.totalText}>Total: ${total.toFixed(2)}</Text>
            <TouchableOpacity style={styles.checkoutButton}>
              <Text style={styles.checkoutText}>Checkout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 20, fontBold: 'bold' },
  content: { flex: 1, flexDirection: 'row' },
  productList: { flex: 2, padding: 16 },
  cart: { flex: 1, padding: 16, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: '#eee' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  productCard: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, elevation: 2 },
  productName: { fontSize: 16 },
  productPrice: { color: '#666' },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  footer: { marginTop: 'auto', borderTopWidth: 1, borderColor: '#eee', paddingTop: 16 },
  totalText: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  checkoutButton: { backgroundColor: '#16a34a', padding: 16, borderRadius: 8, alignItems: 'center' },
  checkoutText: { color: '#fff', fontWeight: 'bold' }
});

export default POS;
