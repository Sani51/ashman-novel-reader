
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadBooks();
    else setBooks([]);
  }, [session]);

  async function loadBooks() {
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) Alert.alert("Library error", error.message);
    else setBooks(data || []);
  }

  async function authenticate() {
    if (!email.trim() || !password) {
      return Alert.alert("Missing details", "Enter your email and password.");
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
    } catch (e) {
      Alert.alert("Authentication", e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSelected(null);
  }

  async function chooseBook() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ],
      copyToCacheDirectory: true
    });

    if (!result.canceled) setBookFile(result.assets[0]);
  }

  async function chooseCover() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return Alert.alert(
        "Permission needed",
        "Allow photo access to choose a cover."
      );
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8
    });

    if (!result.canceled) setCoverFile(result.assets[0]);
  }

  function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function uploadAsset(asset, folder) {
    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const path = `${folder}/${Date.now()}-${safeName(
      asset.name || asset.fileName || "upload"
    )}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: asset.mimeType || "application/octet-stream",
        upsert: false
      });

    if (error) throw error;
    return path;
  }

  async function saveBook() {
    if (!isAdmin) {
      return Alert.alert(
        "Not allowed",
        "Only the administrator can upload books."
      );
    }

    if (!title.trim() || !author.trim() || !bookFile) {
      return Alert.alert(
        "Required",
        "Enter the book title, author, and choose a book file."
      );
    }

    setBusy(true);
    try {
      const filePath = await uploadAsset(bookFile, "books");
      let coverPath = null;

      if (coverFile) {
        coverPath = await uploadAsset(coverFile, "covers");
      }

      const ext = (bookFile.name || "").split(".").pop().toLowerCase();

      const { error } = await supabase.from("books").insert({
        title: title.trim(),
        author: author.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        file_url: filePath,
        cover_image_url: coverPath,
        file_type: ext,
        is_paid: paid,
        price: paid ? Number(price) || 0 : 0
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
      loadBooks();
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e.message || "Could not upload this book."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book) {
    if (book.is_paid) {
      return Alert.alert(
        "Paid book",
        "This book is marked as paid. Payment verification and secure purchase access have not yet been connected."
      );
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(book.file_url, 3600);

      if (error) throw error;

      setSelected(book);

      if ((book.file_type || "").toLowerCase() === "txt") {
        const response = await fetch(data.signedUrl);
        const raw = await response.text();
        const words = raw.split(/\s+/);
        const pages = [];

        for (let i = 0; i < words.length; i += 450) {
          pages.push(words.slice(i, i + 450).join(" "));
        }

        setReaderText(pages.join("\n\n---PAGE---\n\n"));
        setReaderPage(0);
      } else if ((book.file_type || "").toLowerCase() === "pdf") {
        setReaderUrl(data.signedUrl);
      } else {
        setSelected(null);
        Alert.alert(
          "Format not ready",
          "DOC/DOCX files can be uploaded, but must be converted before in-app reading is available."
        );
      }
    } catch (e) {
      Alert.alert(
        "Could not open book",
        e.message || "Please try again."
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
        <ActivityIndicator size="large" />
        <Text>Loading ASHMAN NOVEL LIBRARY…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.logo}>📖</Text>
        <Text style={styles.mainTitle}>ASHMAN NOVEL LIBRARY</Text>
        <Text style={styles.subTitle}>
          Karatu mai armashi, a ko da yaushe
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email address / Imel"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password / Kalmar sirri"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={authenticate}
          disabled={busy}
        >
          <Text style={styles.buttonText}>
            {busy
              ? "Please wait…"
              : isRegister
              ? "Create account / Yi rajista"
              : "Login / Shiga"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)}>
          <Text style={styles.link}>
            {isRegister
              ? "Already registered? Login"
              : "New here? Create an account"}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (selected) {
    return (
      <SafeAreaView style={styles.reader}>
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
            onError={e => Alert.alert("PDF error", String(e))}
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
                  setReaderPage(p => Math.max(0, p - 1))
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
                  setReaderPage(p =>
                    Math.min(textPages.length - 1, p + 1)
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
          <Text style={styles.mainTitle}>ASHMAN NOVEL LIBRARY</Text>
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
            placeholder="Category / Rukunin littafi (optional)"
            value={category}
            onChangeText={setCategory}
          />

          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Book Description / Bayani (optional)"
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
            <Text style={styles.buttonText}>
              {busy ? "Saving…" : "Upload and save book"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.libraryHeader}>
        <Text style={styles.sectionTitle}>Library / Laburare</Text>
        <TouchableOpacity onPress={loadBooks}>
          <Text style={styles.link}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {busy && <ActivityIndicator />}

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
              <Text style={styles.bookTitle}>{item.title}</Text>
              <Text style={styles.bookAuthor}>{item.author}</Text>

              {!!item.category && (
                <Text style={styles.muted}>{item.category}</Text>
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
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2ebe4"
  },
  cover: {
    width: 62,
    height: 82,
    backgroundColor: "#e5f0e7",
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center"
  },
  coverIcon: {
    fontSize: 30
  },
  bookInfo: {
    flex: 1,
    marginLeft: 12
  },
  bookTitle: {
    color: "#183c27",
    fontWeight: "bold",
    fontSize: 16
  },
  bookAuthor: {
    color: "#55685b",
    marginTop: 3
  },
  muted: {
    color: "#77857a",
    marginTop: 3,
    fontSize: 12
  },
  price: {
    color: "#176b40",
    fontWeight: "bold",
    marginTop: 5
  },
  empty: {
    textAlign: "center",
    color: "#748077",
    marginTop: 30
  },
  reader: {
    flex: 1,
    backgroundColor: "#fff"
  },
  readerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    justifyContent: "space-between"
  },
  readerTitle: {
    flex: 1,
    textAlign: "right",
    fontWeight: "bold",
    color: "#173e29"
  },
  pdf: {
    flex: 1,
    width: "100%"
  },
  textReader: {
    flex: 1,
    padding: 18
  },
  pageText: {
    fontSize: 17,
    lineHeight: 29,
    color: "#202820"
  },
  pageControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12
  }
});
turn (
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
        {isAdmin && (
          <View style={styles.adminBox}>
            <Text style={styles.sectionTitle}>Admin Dashboard</Text>

            <Text style={styles.info}>
              Welcome, Administrator.
            </Text>

            <Text style={styles.label}>Book Title / Sunan littafi</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter book title"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>
              Author Name / Sunan marubuci
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter author name"
              value={author}
              onChangeText={setAuthor}
            />

            <Text style={styles.label}>
              Category / Rukunin littafi
            </Text>
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

            <Text style={styles.label}>
              Upload Book / Ɗora littafi (PDF, DOC, DOCX, TXT)
            </Text>

            <TouchableOpacity
              style={styles.pickButton}
              onPress={chooseBookFile}
            >
              <Text style={styles.pickText}>
                {bookFile ? bookFile.name : "Choose book document"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>
              Cover Image / Hoton bangon littafi
            </Text>

            <TouchableOpacity
              style={styles.pickButton}
              onPress={chooseCover}
            >
              <Text style={styles.pickText}>
                {cover ? "Cover image selected" : "Choose cover image"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>
              Book Type / Nau'in littafi
            </Text>

            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  !isPaid && styles.selectedType,
                ]}
                onPress={() => setIsPaid(false)}
              >
                <Text style={styles.typeText}>Free / Kyauta</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeButton,
                  isPaid && styles.selectedType,
                ]}
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
        )}

        <Text style={styles.sectionTitle}>Available Novels</Text>

        {books.length === 0 ? (
          <Text style={styles.info}>
            No books have been uploaded yet.
          </Text>
        ) : (
          books.map((book) => (
            <View key={String(book.id)} style={styles.bookCard}>
              <Text style={styles.bookTitle}>{book.title}</Text>

              <Text style={styles.bookInfo}>
                Author: {book.author}
              </Text>

              {!!book.category && (
                <Text style={styles.bookInfo}>
                  Category: {book.category}
                </Text>
              )}

              {!!book.description && (
                <Text style={styles.bookInfo}>
                  {book.description}
                </Text>
              )}

              <Text style={styles.bookInfo}>
                {book.is_paid
                  ? `Paid: ₦${book.price}`
                  : "Free"}
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

      <Modal
        visible={!!readingBook}
        animationType="slide"
        onRequestClose={closeReader}
      >
        <View style={styles.reader}>
          <View style={styles.readerHeader}>
            <TouchableOpacity onPress={closeReader}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>

            <Text style={styles.readerTitle} numberOfLines={1}>
              {readingBook?.title}
            </Text>

            <Text style={styles.pageCount}>
              {pageNumber} / {totalPages || "…"}
            </Text>
          </View>

          {readingBook?.file_type === "txt" ? (
            textLoading ? (
              <ActivityIndicator
                size="large"
                color="#087A45"
                style={styles.loadingReader}
              />
            ) : (
              <View style={styles.textReader}>
                <Text style={styles.readerText}>
                  {textPages[pageNumber - 1] || ""}
                </Text>

                <View style={styles.pageButtons}>
                  <TouchableOpacity
                    style={styles.pageButton}
                    onPress={() => changeTextPage(-1)}
                  >
                    <Text style={styles.buttonText}>Previous</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.pageButton}
                    onPress={() => changeTextPage(1)}
                  >
                    <Text style={styles.buttonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          ) : readingUrl ? (
            <Pdf
              source={{ uri: readingUrl }}
              style={styles.pdf}
              horizontal
              enablePaging
              page={pageNumber}
              onPageChanged={(page, numberOfPages) => {
                setPageNumber(page);
                setTotalPages(numberOfPages);
              }}
              onLoadComplete={(numberOfPages) => {
                setTotalPages(numberOfPages);
              }}
              onError={(error) => {
                Alert.alert("PDF reader error", String(error));
              }}
              trustAllCerts={false}
            />
          ) : null}
        </View>
      </Modal>
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
        {isAdmin && (
          <View style={styles.adminBox}>
            <Text style={styles.sectionTitle}>Admin Dashboard</Text>

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

            <Text style={styles.label}>
              Upload Book / Ɗora littafi (PDF, DOC, DOCX, TXT)
            </Text>
            <TouchableOpacity
              style={styles.pickButton}
              onPress={chooseBookFile}
            >
              <Text style={styles.pickText}>
                {bookFile ? bookFile.name : "Choose book document"}
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
                <Text style={styles.bookInfo}>
                  Category: {book.category}
                </Text>
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

      <Modal
        visible={!!readingBook}
        animationType="slide"
        onRequestClose={closeReader}
      >
        <View style={styles.reader}>
          <View style={styles.readerHeader}>
            <TouchableOpacity onPress={closeReader}>
              <Text style={styles.closeText}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.readerTitle} numberOfLines={1}>
              {readingBook?.title}
            </Text>
            <Text style={styles.pageCount}>
              {pageNumber} / {totalPages || "…"}
            </Text>
          </View>

          {readingBook?.file_type === "txt" ? (
            textLoading ? (
              <ActivityIndicator
                size="large"
                color="#087A45"
                style={styles.loadingReader}
              />
            ) : (
              <View style={styles.textReader}>
                <Text style={styles.readerText}>
                  {textPages[pageNumber - 1] || ""}
                </Text>

                <View style={styles.pageButtons}>
                  <TouchableOpacity
                    style={styles.pageButton}
                    onPress={() => changeTextPage(-1)}
                  >
                    <Text style={styles.buttonText}>Previous</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pageButton}
                    onPress={() => changeTextPage(1)}
                  >
                    <Text style={styles.buttonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          ) : readingUrl ? (
            <Pdf
              source={{ uri: readingUrl }}
              style={styles.pdf}
              horizontal
              enablePaging
              page={pageNumber}
              onPageChanged={(page, numberOfPages) => {
                setPageNumber(page);
                setTotalPages(numberOfPages);
              }}
              onLoadComplete={(numberOfPages) => {
                setTotalPages(numberOfPages);
              }}
              onError={(error) => {
                Alert.alert("PDF reader error", String(error));
              }}
              trustAllCerts={false}
            />
          ) : null}
        </View>
      </Modal>
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
  textAlign: "center",
},: "{styles.info}>Welcome, Administrator.</Text>

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
