import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  StatusBar
} from "react-native";
import { supabase } from "./supabase";

export default function App() {
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBooks();
  }, []);

  async function loadBooks() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError("An samu matsala wajen kawo littattafai.");
    } else {
      setBooks(data || []);
    }

    setLoading(false);
  }

  const filteredBooks = books.filter((book) =>
    `${book.title || ""} ${book.author || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#102B24" barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.logo}>ASHMAN</Text>
        <Text style={styles.subtitle}>NOVEL LIBRARY</Text>
        <Text style={styles.welcome}>Barka da zuwa ɗakin karatunmu</Text>
      </View>

      <ScrollView>
        <View style={styles.content}>
          <Text style={styles.heading}>Nemo littafinka</Text>

          <TextInput
            style={styles.search}
            placeholder="Rubuta sunan novel ko marubuci..."
            value={search}
            onChangeText={setSearch}
          />

          <Text style={styles.section}>LITTATTAFAI</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#102B24" />
          ) : error ? (
            <Text style={styles.message}>{error}</Text>
          ) : filteredBooks.length === 0 ? (
            <Text style={styles.message}>
              Babu littafi a yanzu. Za a nuna littattafai bayan Admin ya loda su.
            </Text>
          ) : (
            filteredBooks.map((book) => (
              <View key={book.id} style={styles.book}>
                {book.cover_image_url ? (
                  <Image
                    source={{ uri: book.cover_image_url }}
                    style={styles.cover}
                  />
                ) : (
                  <Text style={styles.bookIcon}>📚</Text>
                )}

                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle}>{book.title}</Text>
                  <Text style={styles.author}>{book.author}</Text>
                  <Text style={styles.price}>
                    {book.is_paid
                      ? `₦${book.price || 0}`
                      : "Kyauta"}
                  </Text>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.refresh} onPress={loadBooks}>
            <Text style={styles.refreshText}>Sabunta littattafai</Text>
          </TouchableOpacity>

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
    marginBottom: 15
  },
  message: { color: "#777", textAlign: "center", marginVertical: 25 },
  book: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center"
  },
  cover: { width: 65, height: 90, borderRadius: 7 },
  bookIcon: { fontSize: 40, width: 65, textAlign: "center" },
  bookInfo: { marginLeft: 14, flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: "bold", color: "#102B24" },
  author: { color: "#777", marginTop: 5 },
  price: { color: "#B18A3B", fontWeight: "bold", marginTop: 8 },
  refresh: {
    backgroundColor: "#102B24",
    padding: 14,
    borderRadius: 10,
    marginTop: 15
  },
  refreshText: { color: "#FFFFFF", textAlign: "center", fontWeight: "bold" },
  footer: { textAlign: "center", color: "#888", marginVertical: 30 }
});
