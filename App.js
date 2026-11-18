
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Pdf from "react-native-pdf";
import { supabase } from "./supabase";

const ADMIN_ID = "3d127987-ac50-4d49-9df8-fe8e52f1c67c";
const BUCKET = "novel-files";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [books, setBooks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [readerUrl, setReaderUrl] = useState("");
  const [readerText, setReaderText] = useState("");
  const [readerPage, setReaderPage] = useState(0);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [bookFile, setBookFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);

  const isAdmin = session?.user?.id === ADMIN_ID;

  useEffect(() => {
    let mounted = true;

    async function getSession() {
      const { data, error } = await supabase.auth.getSession();

      if (mounted) {
        if (error) {
          Alert.alert("Login error", error.message);
        }
        setSession(data?.session || null);
        setLoading(false);
      }
    }

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (mounted) setSession(nextSession);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      loadBooks();
    } else {
      setBooks([]);
    }
  }, [session]);

  async function loadBooks() {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Library error", error.message);
    } else {
      setBooks(data || []);
    }
  }

  async function authenticate() {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }

    setBusy(true);

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: "ashmannovellibrary://auth/callback"
          }
        });

        if (error) throw error;

        if (!data.session) {
          Alert.alert(
            "Check your email",
            "Open the verification link sent to your email, then return and log in."
          );
        } else {
          Alert.alert("Welcome", "Your account has been created.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
      }
    } catch (error) {
      Alert.alert(
        "Authentication",
        error.message || "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Logout error", error.message);
    }

    setSelected(null);
    setReaderUrl("");
    setReaderText("");
  }

  async function chooseBook() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ],
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets?.length) {
        setBookFile(result.assets[0]);
      }
    } catch (error) {
      Alert.alert("File error", error.message);
    }
  }

  async function chooseCover() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo access to choose a cover."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });

    if (!result.canceled && result.assets?.length) {
      setCoverFile(result.assets[0]);
    }
  }

  function safeName(name) {
    return String(name || "upload").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
  }

  async function uploadAsset(asset, folder) {
    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const originalName =
      asset.name || asset.fileName || "upload";

    const path =
      `${folder}/${Date.now()}-${safeName(originalName)}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType:
          asset.mimeType || "application/octet-stream",
        upsert: false
      });

    if (error) throw error;

    return path;
  }

  async function saveBook() {
    if (!isAdmin) {
      Alert.alert(
        "Not allowed",
        "Only the administrator can upload books."
      );
      return;
    }

    if (!title.trim() || !author.trim() || !bookFile) {
      Alert.alert(
        "Required",
        "Enter the book title, author, and choose a book file."
      );
      return;
    }

    if (paid && (!price.trim() || Number(price) <= 0)) {
      Alert.alert("Price required", "Enter a valid book price.");
      return;
    }

    setBusy(true);

    try {
      const filePath = await uploadAsset(bookFile, "books");
      let coverPath = null;

      if (coverFile) {
        coverPath = await uploadAsset(coverFile, "covers");
      }

      const ext = (bookFile.name || "")
        .split(".")
        .pop()
        .toLowerCase();

      const { error } = await supabase.from("books").insert({
        title: title.trim(),
        author: author.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        file_url: filePath,
        cover_image_url: coverPath,
        file_type: ext,
        is_paid: paid,
        price: paid ? Number(price) : 0
      });

      if (error) throw error;

      Alert.alert("Saved", "The book has been added to the library.");

      setTitle("");
      setAuthor("");
      setCategory("");
      setDescription("");
      setPrice("");
      setPaid(false);
      setBookFile(null);
      setCoverFile(null);

      await loadBooks();
    } catch (error) {
      Alert.alert(
        "Upload failed",
        error.message || "Could not upload this book."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book) {
    if (book.is_paid) {
      Alert.alert(
        "Paid book",
        "Payment verification and secure purchase access have not yet been connected."
      );
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(book.file_url, 3600);

      if (error) throw error;

      const fileType = (book.file_type || "").toLowerCase();

      if (fileType === "txt") {
        const response = await fetch(data.signedUrl);
        const rawText = await response.text();
        const words = rawText.split(/\s+/);
        const pages = [];

        for (let i = 0; i < words.length; i += 450) {
          pages.push(words.slice(i, i + 450).join(" "));
        }

        setReaderText(pages.join("\n\n---PAGE---\n\n"));
        setReaderPage(0);
        setReaderUrl("");
        setSelected(book);
      } else if (fileType === "pdf") {
        setReaderUrl(data.signedUrl);
        setReaderText("");
        setSelected(book);
      } else {
        Alert.alert(
          "Format not ready",
          "DOC/DOCX files can be uploaded, but must be converted before in-app reading is available."
        );
      }
    } catch (error) {
      Alert.alert(
        "Could not open book",
        error.message || "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function closeReader() {
    setSelected(null);
    setReaderUrl("");
    setReaderText("");
    setReaderPage(0);
  }

  const textPages = readerText
    ? readerText.split("\n\n---PAGE---\n\n")
    : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#176b40" />
        <Text style={styles.loadingText}>
          Loading ASHMAN NOVEL LIBRARY…
        </Text>
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authPage}>
        <StatusBar barStyle="dark-content" />

        <Text style={styles.logo}>📖</Text>

        <Text style={styles.mainTitle}>
          ASHMAN NOVEL LIBRARY
        </Text>

        <Text style={styles.subTitle}>
          S.Y MARUBUCI
        </Text>

        <Text style={styles.authTitle}>
          {isRegister ? "Create Account" : "Welcome Back"}
        </Text>

        <Text style={styles.label}>
          Email Address / Adireshin Email
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>
          Password / Kalmar sirri
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={authenticate}
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
      </SafeAreaView>
    );
  }

  if (selected) {
    return (
      <SafeAreaView style={styles.reader}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.readerHeader}>
          <TouchableOpacity onPress={closeReader}>
            <Text style={styles.link}>‹ Back</Text>
          </TouchableOpacity>

          <Text numberOfLines={1} style={styles.readerTitle}>
            {selected.title}
          </Text>
        </View>

        {(selected.file_type || "").toLowerCase() === "pdf" ? (
          <Pdf
            source={{ uri: readerUrl }}
            horizontal
            enablePaging
            style={styles.pdf}
            onError={error =>
              Alert.alert("PDF error", String(error))
            }
          />
        ) : (
          <View style={styles.textReader}>
            <ScrollView>
              <Text style={styles.pageText}>
                {textPages[readerPage] || ""}
              </Text>
            </ScrollView>

            <View style={styles.pageControls}>
              <TouchableOpacity
                style={styles.secondaryButton}
                disabled={readerPage === 0}
                onPress={() =>
                  setReaderPage(page => Math.max(0, page - 1))
                }
              >
                <Text>Previous</Text>
              </TouchableOpacity>

              <Text>
                Page {readerPage + 1} / {textPages.length}
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                disabled={readerPage >= textPages.length - 1}
                onPress={() =>
                  setReaderPage(page =>
                    Math.min(textPages.length - 1, page + 1)
                  )
                }
              >
                <Text>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.mainTitle}>
            ASHMAN NOVEL LIBRARY
          </Text>

          <Text style={styles.subTitle}>
            {isAdmin ? "Administrator" : "Your reading library"}
          </Text>
        </View>

        <TouchableOpacity onPress={signOut}>
          <Text style={styles.link}>Logout</Text>
        </TouchableOpacity>
      </View>

      {isAdmin && (
        <ScrollView
          style={styles.adminPanel}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionTitle}>
            Add a novel / Ɗora sabon littafi
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Book Title / Sunan littafi"
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={styles.input}
            placeholder="Author Name / Sunan marubuci"
            value={author}
            onChangeText={setAuthor}
          />

          <TextInput
            style={styles.input}
            placeholder="Category / Rukunin littafi"
            value={category}
            onChangeText={setCategory}
          />

          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Book Description / Bayani"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={chooseBook}
          >
            <Text>
              {bookFile
                ? `Selected: ${bookFile.name}`
                : "Choose PDF / DOC / DOCX / TXT"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={chooseCover}
          >
            <Text>
              {coverFile
                ? "Cover selected"
                : "Choose cover image / Hoton littafi"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setPaid(!paid)}
          >
            <Text>
              {paid ? "Paid ✓" : "Free ✓"} (Tap to switch)
            </Text>
          </TouchableOpacity>

          {paid && (
            <TextInput
              style={styles.input}
              placeholder="Price (₦) / Farashi"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={saveBook}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                Upload and save book
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.libraryHeader}>
        <Text style={styles.sectionTitle}>
          Library / Laburare
        </Text>

        <TouchableOpacity onPress={loadBooks}>
          <Text style={styles.link}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {busy && <ActivityIndicator color="#176b40" />}

      <FlatList
        data={books}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.bookList}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No novels have been added yet.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.bookCard}
            onPress={() => openBook(item)}
          >
            <View style={styles.cover}>
              <Text style={styles.coverIcon}>📚</Text>
            </View>

            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle}>
                {item.title}
              </Text>

              <Text style={styles.bookAuthor}>
                {item.author}
              </Text>

              {!!item.category && (
                <Text style={styles.muted}>
                  {item.category}
                </Text>
              )}

              {!!item.description && (
                <Text numberOfLines={2} style={styles.muted}>
                  {item.description}
                </Text>
              )}

              <Text style={styles.price}>
                {item.is_paid ? `₦${item.price}` : "FREE"}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authPage: {
    flex: 1,
    backgroundColor: "#f7fbf8",
    justifyContent: "center",
    padding: 24
  },
  page: {
    flex: 1,
    backgroundColor: "#f7fbf8",
    paddingTop: 12
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: 12,
    color: "#145c36"
  },
  logo: {
    fontSize: 58,
    textAlign: "center",
    marginBottom: 12
  },
  mainTitle: {
    color: "#145c36",
    fontSize: 21,
    fontWeight: "bold"
  },
  subTitle: {
    color: "#64756a",
    marginTop: 4,
    marginBottom: 18
  },
  authTitle: {
    color: "#164c30",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12
  },
  label: {
    color: "#164c30",
    fontWeight: "600",
    marginTop: 8
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#d7e4da",
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    marginVertical: 6,
    color: "#17251b"
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#176b40",
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    marginVertical: 8
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold"
  },
  secondaryButton: {
    backgroundColor: "#e9f2eb",
    borderRadius: 9,
    padding: 12,
    marginVertical: 5,
    alignItems: "center"
  },
  switchButton: {
    alignItems: "center",
    padding: 8
  },
  switchText: {
    color: "#176b40",
    fontWeight: "bold"
  },
  info: {
    color: "#64756a",
    textAlign: "center",
    marginTop: 14
  },
  link: {
    color: "#176b40",
    fontWeight: "bold",
    paddingVertical: 10
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  adminPanel: {
    maxHeight: 360,
    marginHorizontal: 14,
    padding: 12,
    backgroundColor: "#edf5ef",
    borderRadius: 12
  },
  sectionTitle: {
    color: "#164c30",
    fontSize: 17,
    fontWeight: "bold"
  },
  libraryHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  bookList: {
    paddingHorizontal: 14,
    paddingBottom: 30
  },
    bookCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2
  }
});
 
