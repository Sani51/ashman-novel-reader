
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const ADMIN_ID = "3d127987-ac50-4d49-9df8-fe8e52f1c67c";
const REDIRECT_URL = "ashmannovellibrary://auth/callback";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [books, setBooks] = useState([]);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [cover, setCover] = useState(null);

  const isAdmin = session?.user?.id === ADMIN_ID;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) setSession(newSession);
      }
    );

    const handleUrl = async (url) => {
      if (!url || !url.startsWith(REDIRECT_URL)) return;

      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (error) {
        console.log("Email verification link:", error);
      }
    };

    Linking.getInitialURL().then(handleUrl);

    const linkListener = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      linkListener.remove();
    };
  }, []);

  useEffect(() => {
    if (session) loadBooks();
  }, [session]);

  async function loadBooks() {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setBooks(data || []);
  }

  async function registerOrLogin() {
    if (!email.trim() || !password) {
      Alert.alert("Required", "Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Password", "Password must be at least 6 characters.");
      return;
    }

    setBusy(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: REDIRECT_URL,
          },
        });

        if (error) throw error;

        if (!data.session) {
          Alert.alert(
            "Check your email",
            "An email confirmation link has been sent. Open it to verify your account."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      Alert.alert("Account message", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Error", error.message);
    setBooks([]);
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.length) {
      setPdf(result.assets[0]);
    }
  }

  async function chooseCover() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission", "Please allow photo library access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      setCover(result.assets[0]);
    }
  }

  async function uploadFile(file, path, contentType) {
    const response = await fetch(file.uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from("novel-files")
      .upload(path, blob, {
        contentType,
        upsert: false,
      });

    if (error) throw error;
    return path;
  }

  async function addBook() {
    if (!isAdmin) {
      Alert.alert("Access denied", "Only the administrator can add books.");
      return;
    }

    if (!title.trim() || !author.trim() || !pdf) {
      Alert.alert(
        "Missing information",
        "Please enter the book title, author name, and select a PDF."
      );
      return;
    }

    if (isPaid && (!price.trim() || Number(price) <= 0)) {
      Alert.alert("Price", "Enter a valid price for this paid book.");
      return;
    }

    setBusy(true);

    try {
      const timestamp = Date.now();
      const safeTitle = title.trim().replace(/[^a-zA-Z0-9_-]/g, "_");

      const pdfPath = `books/${timestamp}_${safeTitle}.pdf`;

      await uploadFile(pdf, pdfPath, "application/pdf");

      let coverPath = null;

      if (cover) {
        const extension = cover.uri.split(".").pop()?.split("?")[0] || "jpg";
        coverPath = `covers/${timestamp}_cover.${extension}`;

        await uploadFile(
          cover,
          coverPath,
          cover.mimeType || "image/jpeg"
        );
      }

      const { error } = await supabase.from("books").insert({
        title: title.trim(),
        author: author.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        file_url: pdfPath,
        cover_image_url: coverPath,
        file_type: "pdf",
        is_paid: isPaid,
        price: isPaid ? Number(price) : 0,
      });

      if (error) throw error;

      Alert.alert("Success", "The book has been added.");

      setTitle("");
      setAuthor("");
      setCategory("");
      setDescription("");
      setPrice("");
      setIsPaid(false);
      setPdf(null);
      setCover(null);

      loadBooks();
    } catch (error) {
      Alert.alert("Upload failed", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book) {
    if (!session) return;

    if (book.is_paid) {
      Alert.alert(
        "Paid book",
        "Payment verification is not yet connected to this app."
      );
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("novel-files")
        .createSignedUrl(book.file_url, 300);

      if (error) throw error;

      await Linking.openURL(data.signedUrl);
    } catch (error) {
      Alert.alert("Unable to open book", error.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#087A45" />
        <Text style={styles.info}>Loading ASHMAN NOVEL LIBRARY...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.authPage}>
        <StatusBar style="dark" />

        <Text style={styles.logo}>📖</Text>
        <Text style={styles.mainTitle}>ASHMAN NOVEL LIBRARY</Text>
        <Text style={styles.subtitle}>S.Y MARUBUCI</Text>

        <Text style={styles.authTitle}>
          {isRegister ? "Create Account" : "Welcome Back"}
        </Text>

        <Text style={styles.label}>Email Address / Adireshin Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password / Kalmar sirri</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={registerOrLogin}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isRegister ? "Register" : "Login"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsRegister(!isRegister)}
          style={styles.switchButton}
        >
          <Text style={styles.switchText}>
            {isRegister
              ? "Already have an account? Login"
              : "Don't have an account? Register"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.info}>
          Registration is free. Create an account to access the library.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>ASHMAN NOVEL LIBRARY</Text>
        <Text style={styles.headerSubtitle}>S.Y MARUBUCI</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isAdmin ? (
          <View style={styles.adminBox}>
            <Text style={styles.sectionTitle}>Admin Dashboard</Text>
            <Text style={styles.info}>Welcome, Administrator.</Text>

            <Text style={styles.label}>Book Title / Sunan littafi</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter book title"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Author Name / Sunan marubuci</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter author name"
              value={author}
              onChangeText={setAuthor}
            />

            <Text style={styles.label}>Category / Rukunin littafi</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: Romance"
              value={category}
              onChangeText={setCategory}
            />

            <Text style={styles.label}>
              Book Description / Taƙaitaccen bayanin littafi
            </Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder="Write a short description"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.label}>Upload PDF / Ɗora PDF</Text>
            <TouchableOpacity style={styles.pickButton} onPress={choosePdf}>
              <Text style={styles.pickText}>
                {pdf ? pdf.name : "Choose PDF file"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>
              Cover Image / Hoton bangon littafi
            </Text>
            <TouchableOpacity style={styles.pickButton} onPress={chooseCover}>
              <Text style={styles.pickText}>
                {cover ? "Cover image selected" : "Choose cover image"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Book Type / Nau'in littafi</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeButton, !isPaid && styles.selectedType]}
                onPress={() => setIsPaid(false)}
              >
                <Text style={styles.typeText}>Free / Kyauta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, isPaid && styles.selectedType]}
                onPress={() => setIsPaid(true)}
              >
                <Text style={styles.typeText}>Paid / Na kuɗi</Text>
              </TouchableOpacity>
            </View>

            {isPaid && (
              <>
                <Text style={styles.label}>Price (₦) / Farashi</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter price"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                />
              </>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={addBook}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Upload Book</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.sectionTitle}>My Library / Laburaren littattafai</Text>
        )}

        <Text style={styles.sectionTitle}>Available Novels</Text>

        {books.length === 0 ? (
          <Text style={styles.info}>No books have been uploaded yet.</Text>
        ) : (
          books.map((book) => (
            <View key={String(book.id)} style={styles.bookCard}>
              <Text style={styles.bookTitle}>{book.title}</Text>
              <Text style={styles.bookInfo}>Author: {book.author}</Text>
              {!!book.category && (
                <Text style={styles.bookInfo}>Category: {book.category}</Text>
              )}
              {!!book.description && (
                <Text style={styles.bookInfo}>{book.description}</Text>
              )}
              <Text style={styles.bookInfo}>
                {book.is_paid ? `Paid: ₦${book.price}` : "Free"}
              </Text>

              <TouchableOpacity
                style={styles.readButton}
                onPress={() => openBook(book)}
              >
                <Text style={styles.buttonText}>
                  {book.is_paid ? "View Book Details" : "Read Book"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  authPage: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  page: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  header: {
    backgroundColor: "#087A45",
    padding: 22,
    paddingTop: 48,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  headerSubtitle: {
    color: "#F5D77B",
    textAlign: "center",
    marginTop: 5,
  },
  logout: {
    color: "#fff",
    textAlign: "right",
    marginTop: 12,
  },
  logo: {
    fontSize: 48,
    textAlign: "center",
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#087A45",
    textAlign: "center",
    marginTop: 10,
  },
  subtitle: {
    textAlign: "center",
    color: "#B58A24",
    marginBottom: 30,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 18,
    color: "#173D2B",
  },
  label: {
    fontWeight: "600",
    color: "#263B30",
    marginTop: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D5DED8",
    borderRadius: 9,
    padding: 12,
    backgroundColor: "#fff",
    color: "#222",
  },
  descriptionInput: {
    minHeight: 85,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#087A45",
    padding: 15,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  switchButton: {
    alignItems: "center",
    padding: 18,
  },
  switchText: {
    color: "#087A45",
    fontWeight: "600",
  },
  info: {
    color: "#65736A",
    textAlign: "center",
    marginTop: 12,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  adminBox: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 22,
  },
  sectionTitle: {
    color: "#087A45",
    fontSize: 19,
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 8,
  },
  pickButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#087A45",
    borderRadius: 8,
    marginTop: 4,
  },
  pickText: {
    color: "#087A45",
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D5DED8",
    borderRadius: 8,
    alignItems: "center",
  },
  selectedType: {
    backgroundColor: "#DDF2E5",
    borderColor: "#087A45",
  },
  typeText: {
    color: "#174A30",
    fontWeight: "600",
  },
  bookCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  bookTitle: {
    fontSize: 18,
    color: "#087A45",
    fontWeight: "bold",
  },
  bookInfo: {
    color: "#555",
    marginTop: 7,
  },
  readButton: {
    backgroundColor: "#087A45",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
});
