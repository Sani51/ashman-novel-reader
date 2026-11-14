import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar
} from "react-native";

export default function App() {
  const [search, setSearch] = useState("");

  const categories = ["Duka", "Soyayya", "Tarihi", "Rayuwa", "Abin al'ajabi"];

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#102B24" barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.logo}>ASHMAN</Text>
        <Text style={styles.subtitle}>NOVEL LIBRARY</Text>
        <Text style={styles.welcome}>Barka da zuwa ɗakin karatunmu</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.heading}>Nemo littafinka</Text>

          <TextInput
            style={styles.search}
            placeholder="Rubuta sunan novel..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
          />

          <Text style={styles.section}>RUKUNAN LITTATTAFAI</Text>

          <View style={styles.categories}>
            {categories.map((item) => (
              <TouchableOpacity key={item} style={styles.category}>
                <Text style={styles.categoryText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>SABABBIN LITTATTAFAI</Text>

          <View style={styles.empty}>
            <Text style={styles.bookIcon}>📚</Text>
            <Text style={styles.emptyTitle}>Babu littattafai tukuna</Text>
            <Text style={styles.emptyText}>
              Za a nuna novels a nan bayan Admin ya loda su.
            </Text>
          </View>

          <Text style={styles.footer}>© ASHMAN NOVEL LIBRARY</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7F5" },
  header: {
    backgroundColor: "#102B24",
    padding: 28,
    paddingTop: 45,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25
  },
  logo: { color: "#FFFFFF", fontSize: 27, fontWeight: "bold" },
  subtitle: { color: "#D6B56D", fontSize: 13, letterSpacing: 3 },
  welcome: { color: "#FFFFFF", marginTop: 28, fontSize: 17 },
  content: { padding: 20 },
  heading: { fontSize: 21, fontWeight: "bold", color: "#102B24" },
  search: {
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    marginBottom: 25,
    color: "#222"
  },
  section: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#102B24",
    marginBottom: 15,
    marginTop: 10
  },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  category: {
    backgroundColor: "#DCE9E1",
    padding: 12,
    borderRadius: 20
  },
  categoryText: { color: "#102B24", fontWeight: "600" },
  empty: {
    backgroundColor: "#FFFFFF",
    padding: 30,
    borderRadius: 15,
    alignItems: "center"
  },
  bookIcon: { fontSize: 40 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#102B24",
    marginTop: 12
  },
  emptyText: { color: "#777", textAlign: "center", marginTop: 8 },
  footer: {
    textAlign: "center",
    color: "#888",
    marginTop: 35,
    marginBottom: 25
  }
});
