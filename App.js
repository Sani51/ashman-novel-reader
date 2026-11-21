import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Pdf from "react-native-pdf";
import { supabase } from "./supabase";

const ADMIN_ID = "3d127987-ac50-4d49-9df8-fe8e52f1c67c";
const BUCKET = "novel-files";
const REDIRECT_URL = "ashmannovellibrary://auth/callback";

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
  const [readerTheme, setReaderTheme] = useState("light");
  const [readerFontSize, setReaderFontSize] = useState(22);

  const readerColors = {
    light: { background: "#ffffff", text: "#202820", border: "#e5eae6", button: "#f0f3f1" },
    dark: { background: "#111111", text: "#f4f4f4", border: "#444444", button: "#292929" },
    grey: { background: "#d9d9d9", text: "#222222", border: "#b8b8b8", button: "#c8c8c8" }
  }[readerTheme];
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [bookFile, setBookFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, failed: 0 });

  const isAdmin = session?.user?.id === ADMIN_ID;
  const textPages = useMemo(
    () => readerText ? readerText.split("\n\n---PAGE---\n\n") : [],
    [readerText]
  );

  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) setSession(data?.session || null);
      } catch (e) {
        Alert.alert("Login error", e?.message || "Could not restore session.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    restoreSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) setSession(next);
    });
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) loadBooks();
    else setBooks([]);
  }, [session]);

  async function loadBooks() {
    try {
      const { data, error } = await supabase.from("books").select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setBooks(data || []);
    } catch (e) {
      Alert.alert("Library error", e?.message || "Could not load books.");
    }
  }

  async function authenticate() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail, password,
          options: { emailRedirectTo: REDIRECT_URL }
        });
        if (error) throw error;
        Alert.alert(
          data?.session ? "Welcome" : "Check your email",
          data?.session ? "Your account has been created." :
            "Open the verification link sent to your email, then return and log in."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail, password
        });
        if (error) throw error;
      }
    } catch (e) {
      Alert.alert("Authentication", e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      closeReader();
    } catch (e) {
      Alert.alert("Logout error", e?.message || "Could not log out.");
    }
  }

  async function chooseBook() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true, multiple: false
      });
      if (!result.canceled && result.assets?.length) setBookFile(result.assets[0]);
    } catch (e) {
      Alert.alert("File error", e?.message || "Could not choose file.");
    }
  }

  async function chooseBulkBooks() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true, multiple: true
      });
      if (!result.canceled && result.assets?.length) {
        const valid = result.assets.filter(asset =>
          ["pdf", "txt", "doc", "docx"].includes(getExtension(asset))
        );
        const rejected = result.assets.length - valid.length;
        setBulkFiles(valid);
        if (rejected) Alert.alert("Some files skipped", `${rejected} unsupported file(s) were not selected. Choose PDF, TXT, DOC or DOCX files.`);
      }
    } catch (e) {
      Alert.alert("File selection failed", e?.message || "Could not select files.");
    }
  }

  async function uploadBulkBooks() {
    if (!isAdmin) {
      Alert.alert("Not allowed", "Only the administrator can upload books.");
      return;
    }
    if (!bulkFiles.length || !author.trim()) {
      Alert.alert("Required details", "Select book files and enter the author name. The filename will be used as each book title.");
      return;
    }
    if (paid && (!price.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0)) {
      Alert.alert("Price required", "Enter a valid price for the books.");
      return;
    }
    setBusy(true);
    const total = bulkFiles.length;
    let done = 0;
    let failed = 0;
    setBulkProgress({ done: 0, total, failed: 0 });
    const remaining = [];
    try {
      for (const asset of bulkFiles) {
        let filePath = null;
        const ext = getExtension(asset);
        const filename = getFileName(asset);
        const bookTitle = filename.replace(/\\.[^.]+$/, "").trim() || "Untitled book";
        try {
          const folder = ext === "pdf" ? "pdfs" : ext === "txt" ? "texts" : "documents";
          filePath = await uploadAsset(asset, folder);
          const { error } = await supabase.from("books").insert({
            title: bookTitle, author: author.trim(),
            category: category.trim() || null,
            description: description.trim() || null,
            file_url: filePath, cover_image_url: null,
            file_type: ext, is_paid: paid, price: paid ? Number(price) : 0
          });
          if (error) throw error;
        } catch (e) {
          failed += 1;
          remaining.push(asset);
          if (filePath) {
            try { await supabase.storage.from(BUCKET).remove([filePath]); } catch (_) {}
          }
        } finally {
          done += 1;
          setBulkProgress({ done, total, failed });
        }
      }
      setBulkFiles(remaining);
      await loadBooks();
      Alert.alert(
        failed ? "Bulk upload finished with errors" : "Bulk upload complete",
        `${done - failed} book(s) uploaded successfully. ${failed} failed.${failed ? " Failed files remain selected so you can retry them." : ""}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseCover() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access to choose a cover.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.8
      });
      if (!result.canceled && result.assets?.length) setCoverFile(result.assets[0]);
    } catch (e) {
      Alert.alert("Image error", e?.message || "Could not choose image.");
    }
  }

  function getFileName(asset) {
    return asset?.name || asset?.fileName ||
      asset?.uri?.split("/").pop()?.split("?")[0] || "upload";
  }

  function safeName(name) {
    return String(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  function getExtension(asset) {
    const parts = getFileName(asset).split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function getMimeType(asset, ext) {
    if (asset?.mimeType) return asset.mimeType;
    const types = {
      pdf: "application/pdf", txt: "text/plain", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp"
    };
    return types[ext] || "application/octet-stream";
  }

  async function uploadAsset(asset, folder) {
    if (!asset?.uri) throw new Error("Please select a valid file.");
    const ext = getExtension(asset);
    const path = `${folder}/${Date.now()}-${safeName(getFileName(asset))}`;
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error("Could not read the selected file from your device.");
    const blob = await response.blob();
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: getMimeType(asset, ext), upsert: false
    });
    if (error) throw error;
    return path;
  }

  async function saveBook() {
    if (!isAdmin) {
      Alert.alert("Not allowed", "Only the administrator can upload books.");
      return;
    }
    if (!title.trim() || !author.trim() || !bookFile) {
      Alert.alert("Required", "Enter the book title, author, and choose a book file.");
      return;
    }
    const ext = getExtension(bookFile);
    if (!["pdf", "txt", "doc", "docx"].includes(ext)) {
      Alert.alert("Unsupported file", "Choose PDF, TXT, DOC or DOCX.");
      return;
    }
    if (paid && (!price.trim() || !Number.isFinite(Number(price)) || Number(price) <= 0)) {
      Alert.alert("Price required", "Enter a valid book price.");
      return;
    }
    setBusy(true);
    let filePath = null;
    let coverPath = null;
    try {
      const folder = ext === "pdf" ? "pdfs" : ext === "txt" ? "texts" : "documents";
      filePath = await uploadAsset(bookFile, folder);
      if (coverFile) coverPath = await uploadAsset(coverFile, "covers");
      const { error } = await supabase.from("books").insert({
        title: title.trim(), author: author.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        file_url: filePath, cover_image_url: coverPath,
        file_type: ext, is_paid: paid, price: paid ? Number(price) : 0
      });
      if (error) throw error;
      Alert.alert("Saved", "The book has been added to the library.");
      setTitle(""); setAuthor(""); setCategory(""); setDescription("");
      setPrice(""); setPaid(false); setBookFile(null); setCoverFile(null);
      await loadBooks();
    } catch (e) {
      const paths = [filePath, coverPath].filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      Alert.alert("Upload failed", e?.message || "Could not upload this book.");
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book) {
    if (book?.is_paid) {
      Alert.alert("Paid book",
        "Payment verification and secure purchase access have not yet been connected.");
      return;
    }
    if (!book?.file_url || typeof book.file_url !== "string") {
      Alert.alert("File missing", "The file path for this book is missing.");
      return;
    }
    const fileType = String(book.file_type || "").toLowerCase();
    if (!["pdf", "txt"].includes(fileType)) {
      Alert.alert("Format not ready",
        "DOC/DOCX can be uploaded, but must be converted before in-app reading is available.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET)
        .createSignedUrl(book.file_url, 3600);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Supabase did not provide a file link.");
      if (fileType === "txt") {
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error("Could not download the TXT file from Supabase.");
        const rawText = await response.text();
        if (!rawText.trim()) throw new Error("This book contains no text.");
        const words = rawText.split(/\s+/);
        const pages = [];
        for (let i = 0; i < words.length; i += 450) {
          pages.push(words.slice(i, i + 450).join(" "));
        }
        setReaderText(pages.join("\n\n---PAGE---\n\n"));
        setReaderPage(0); setReaderUrl(""); setSelected(book);
      } else {
        setReaderText(""); setReaderPage(0); setReaderUrl(data.signedUrl);
        setSelected(book);
      }
    } catch (e) {
      Alert.alert("Could not open book", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function closeReader() {
    setSelected(null); setReaderUrl(""); setReaderText(""); setReaderPage(0);
  }

  if (loading) {
    return <View style={styles.center}>
      <ActivityIndicator size="large" color="#176b40" />
      <Text style={styles.loadingText}>Loading ASHMAN NOVEL LIBRARY…</Text>
    </View>;
  }

  if (!session) {
    return <SafeAreaView style={styles.authPage}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>📖</Text>
        <Text style={styles.mainTitle}>ASHMAN NOVEL LIBRARY</Text>
        <Text style={styles.subTitle}>S.Y MARUBUCI</Text>
        <Text style={styles.authTitle}>{isRegister ? "Create Account" : "Welcome Back"}</Text>
        <Text style={styles.label}>Email Address</Text>
        <TextInput style={styles.input} placeholder="Enter your email" value={email}
          onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} placeholder="Enter your password" value={password}
          onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.primaryButton} onPress={authenticate} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> :
            <Text style={styles.buttonText}>{isRegister ? "Register" : "Login"}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsRegister(v => !v)} style={styles.switchButton}>
          <Text style={styles.switchText}>{isRegister ?
            "Already have an account? Login" : "Don't have an account? Register"}</Text>
        </TouchableOpacity>
        <Text style={styles.info}>Registration is free. Create an account to access the library.</Text>
      </ScrollView>
    </SafeAreaView>;
  }

  if (selected) {
    return <SafeAreaView style={[styles.reader, { backgroundColor: readerColors.background }]}>
      <StatusBar barStyle={readerTheme === "dark" ? "light-content" : "dark-content"} />
      <View style={[styles.readerHeader, { backgroundColor: readerColors.background, borderBottomColor: readerColors.border }]}>
        <TouchableOpacity onPress={closeReader}><Text style={styles.link}>‹ Back</Text></TouchableOpacity>
        <Text numberOfLines={1} style={[styles.readerTitle, { color: readerColors.text }]}>{selected.title}</Text>
      </View>
      <View style={[styles.readerTools, { backgroundColor: readerColors.background, borderBottomColor: readerColors.border }]}>
        <Text style={[styles.readerToolLabel, { color: readerColors.text }]}>Reading theme</Text>
        {[
          { key: "light", label: "White" },
          { key: "dark", label: "Black" },
          { key: "grey", label: "Grey" }
        ].map(option => (
          <TouchableOpacity key={option.key}
            onPress={() => setReaderTheme(option.key)}
            style={[styles.themeButton, { backgroundColor: readerTheme === option.key ? "#176b40" : readerColors.button }]}>
            <Text style={{ color: readerTheme === option.key ? "#ffffff" : readerColors.text, fontWeight: "700" }}>{option.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.fontButton, { backgroundColor: readerColors.button }]}
          onPress={() => setReaderFontSize(size => Math.max(18, size - 1))}>
          <Text style={{ color: readerColors.text, fontWeight: "900" }}>A−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fontButton, { backgroundColor: readerColors.button }]}
          onPress={() => setReaderFontSize(size => Math.min(32, size + 1))}>
          <Text style={{ color: readerColors.text, fontWeight: "900" }}>A+</Text>
        </TouchableOpacity>
      </View>
      {String(selected.file_type || "").toLowerCase() === "pdf" ? (
        readerUrl ? <View style={{ flex: 1, backgroundColor: readerColors.background }}>
          <Pdf key={readerUrl} source={{ uri: readerUrl }} trustAllCerts={false} horizontal enablePaging
            style={[styles.pdf, { backgroundColor: readerColors.background }]}
            onError={e => Alert.alert("PDF error", String(e?.message || e))} />
        </View> :
        <View style={styles.center}><Text>PDF URL is missing.</Text></View>
      ) : (
        <View style={[styles.textReader, { backgroundColor: readerColors.background }]}>
          <ScrollView contentContainerStyle={[styles.textPageContent, { backgroundColor: readerColors.background }]}>
            <Text style={[styles.pageText, { color: readerColors.text, fontSize: readerFontSize, lineHeight: Math.round(readerFontSize * 1.65) }]}>{textPages[readerPage] || ""}</Text>
          </ScrollView>
          <View style={[styles.pageControls, { backgroundColor: readerColors.background, borderTopColor: readerColors.border }]}>
            <TouchableOpacity style={[styles.secondaryButton, readerPage === 0 && styles.disabledButton]}
              disabled={readerPage === 0} onPress={() => setReaderPage(p => Math.max(0, p - 1))}>
              <Text style={styles.secondaryButtonText}>Previous</Text>
            </TouchableOpacity>
            <Text style={[styles.pageNumber, { color: readerColors.text }]}>Page {readerPage + 1} / {textPages.length}</Text>
            <TouchableOpacity style={[styles.secondaryButton,
              readerPage >= textPages.length - 1 && styles.disabledButton]}
              disabled={readerPage >= textPages.length - 1}
              onPress={() => setReaderPage(p => Math.min(textPages.length - 1, p + 1))}>
              <Text style={styles.secondaryButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.page}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.topBar}>
      <View style={styles.brandBlock}>
        <Text style={styles.mainTitle}>ASHMAN NOVEL LIBRARY</Text>
        <Text style={styles.subTitle}>{isAdmin ? "Administrator" : "Your reading library"}</Text>
      </View>
      <TouchableOpacity onPress={signOut}><Text style={styles.link}>Logout</Text></TouchableOpacity>
    </View>

    {isAdmin && <ScrollView style={styles.adminPanel}
      contentContainerStyle={styles.adminContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Add a Book</Text>
      <Text style={styles.fieldLabel}>Book Title</Text>\n      <Text style={styles.fieldHint}>Enter the full title of the novel.</Text>\n      
      <TextInput style={styles.input} placeholder="Example: RAINA KAMA"
        value={title} onChangeText={setTitle} />
      <Text style={styles.fieldLabel}>Author Name</Text>\n      <Text style={styles.fieldHint}>Enter the writer's name exactly as it should appear.</Text>\n      
      <TextInput style={styles.input} placeholder="Example: BILYN ABDULL"
        value={author} onChangeText={setAuthor} />
      <Text style={styles.fieldLabel}>Category</Text>\n      <Text style={styles.fieldHint}>Choose the book's subject or genre, such as Romance, History or Islamic.</Text>\n      
      <TextInput style={styles.input} placeholder="Example: Romance"
        value={category} onChangeText={setCategory} />
      <Text style={styles.fieldLabel}>Book Description</Text>\n      <Text style={styles.fieldHint}>Write a short summary to help readers understand the story.</Text>\n      
      <TextInput style={[styles.input, styles.multiline]} placeholder="Write a short summary here..."
        value={description} onChangeText={setDescription} multiline />
      <Text style={styles.fieldLabel}>Book File</Text>
      <Text style={styles.fieldHint}>Select the actual novel document (PDF, DOC, DOCX or TXT).</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={chooseBook}>
        <Text style={styles.secondaryButtonText}>{bookFile ?
          `Selected: ${getFileName(bookFile)}` : "Choose PDF / DOC / DOCX / TXT"}</Text>
      </TouchableOpacity>
      <Text style={styles.fieldLabel}>Cover Image</Text>
      <Text style={styles.fieldHint}>Select the picture that will appear on the book card.</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={chooseCover}>
        <Text style={styles.secondaryButtonText}>{coverFile ?
          "Cover selected" : "Choose Cover Image"}</Text>
      </TouchableOpacity>
      <Text style={styles.fieldLabel}>Book Access Type</Text>
      <Text style={styles.fieldHint}>Choose Free for no charge, or Paid to set a selling price.</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => setPaid(v => !v)}>
        <Text style={styles.secondaryButtonText}>{paid ? "Paid ✓" : "Free ✓"} (Tap to switch)</Text>
      </TouchableOpacity>
      {paid && <>
        <Text style={styles.fieldLabel}>Book Price (₦)</Text>
        <Text style={styles.fieldHint}>Enter the amount readers must pay.</Text>
        <TextInput style={styles.input} placeholder="Example: 1500"
          keyboardType="numeric" value={price} onChangeText={setPrice} />
      </>}
      <TouchableOpacity style={styles.primaryButton} onPress={saveBook} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> :
          <Text style={styles.buttonText}>Upload and save book</Text>}
      </TouchableOpacity>
      <View style={styles.bulkPanel}>
        <Text style={styles.sectionTitle}>Bulk Book Upload</Text>
        <Text style={styles.bulkHint}>Select multiple PDF, TXT, DOC or DOCX files. Each filename becomes the book title. The author, category, description and price above will apply to every selected book. Cover images can be added individually later.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={chooseBulkBooks} disabled={busy}>
          <Text style={styles.secondaryButtonText}>{bulkFiles.length ? `${bulkFiles.length} file(s) selected` : "Select Multiple Book Files"}</Text>
        </TouchableOpacity>
        {bulkFiles.slice(0, 5).map((file, index) => (
          <Text key={`${getFileName(file)}-${index}`} style={styles.bulkFile} numberOfLines={1}>• {getFileName(file)}</Text>
        ))}
        {bulkFiles.length > 5 && <Text style={styles.bulkFile}>And {bulkFiles.length - 5} more file(s)</Text>}
        {bulkProgress.total > 0 && <Text style={styles.bulkHint}>Progress: {bulkProgress.done}/{bulkProgress.total} • Failed: {bulkProgress.failed}</Text>}
        <TouchableOpacity style={styles.primaryButton} onPress={uploadBulkBooks} disabled={busy || !bulkFiles.length}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Upload All Selected Books</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>}

    <View style={styles.libraryHeader}>
      <Text style={styles.sectionTitle}>Library</Text>
      <TouchableOpacity onPress={loadBooks}><Text style={styles.link}>Refresh</Text></TouchableOpacity>
    </View>
    {busy && <ActivityIndicator style={styles.listLoader} color="#176b40" />}
    <FlatList data={books.filter(item => (item.title || "").trim().toLowerCase() !== "attajiri")} keyExtractor={item => String(item.id)}
      contentContainerStyle={styles.bookList}
      ListEmptyComponent={<Text style={styles.empty}>No novels have been added yet.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.bookCard} onPress={() => openBook(item)} disabled={busy}>
          <View style={styles.cover}><Text style={styles.coverIcon}>📚</Text></View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>{item.title || "Untitled book"}</Text>
            <Text style={styles.bookAuthor}>{item.author || "Unknown author"}</Text>
            {!!item.category && <Text style={styles.muted}>{item.category}</Text>}
            {!!item.description && <Text numberOfLines={2} style={styles.muted}>{item.description}</Text>}
            <Text style={styles.price}>{item.is_paid ? `₦${item.price}` : "FREE"}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f8f5" },
  authPage: { flex: 1, backgroundColor: "#f6f8f5" },
  authContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 24 },
  loadingText: { marginTop: 12, color: "#355443", fontSize: 14 },
  logo: { fontSize: 58, textAlign: "center", marginBottom: 10 },
  mainTitle: { color: "#176b40", fontSize: 20, fontWeight: "900", letterSpacing: 0.5 },
  subTitle: { color: "#b18a36", fontSize: 13, fontWeight: "700", marginTop: 4 },
  authTitle: { color: "#173b2a", fontSize: 23, fontWeight: "800", marginTop: 36, marginBottom: 20 },
  label: { color: "#355443", fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 10 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d9e3dc", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: "#17251d", marginBottom: 12, fontSize: 14 },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: "#176b40", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 8, marginBottom: 10 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  switchButton: { alignItems: "center", padding: 12 },
  switchText: { color: "#176b40", fontWeight: "700", textAlign: "center" },
  info: { color: "#718078", textAlign: "center", fontSize: 12, marginTop: 18, lineHeight: 18 },
  topBar: { paddingHorizontal: 17, paddingVertical: 15, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e4ebe6", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandBlock: { flexShrink: 1 },
  link: { color: "#176b40", fontWeight: "800", fontSize: 14, padding: 5 },
  adminPanel: { maxHeight: 520, backgroundColor: "#edf4ee", margin: 12, borderRadius: 12 },
  adminContent: { padding: 13 },
  fieldLabel: { color: "#173b2a", fontSize: 15, fontWeight: "800", marginTop: 7, marginBottom: 3 },
  fieldHint: { color: "#66776c", fontSize: 12, lineHeight: 17, marginBottom: 7 },
  bulkPanel: { borderTopWidth: 1, borderTopColor: "#d3e0d6", marginTop: 8, paddingTop: 12 },
  bulkHint: { color: "#627368", fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 9 },
  bulkFile: { color: "#355443", fontSize: 12, marginBottom: 4 },
  sectionTitle: { color: "#173b2a", fontSize: 17, fontWeight: "800" },
  secondaryButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd9cf", borderRadius: 9, paddingVertical: 12, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  secondaryButtonText: { color: "#294b37", fontWeight: "700", textAlign: "center", fontSize: 13 },
  disabledButton: { opacity: 0.4 },
  libraryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 17, paddingTop: 12, paddingBottom: 5 },
  listLoader: { marginVertical: 8 },
  bookList: { padding: 12, paddingBottom: 30, flexGrow: 1 },
  empty: { textAlign: "center", color: "#7b8980", marginTop: 35 },
  bookCard: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 11, borderWidth: 1, borderColor: "#e3ebe5" },
  cover: { width: 65, height: 88, borderRadius: 8, backgroundColor: "#e7f0e8", alignItems: "center", justifyContent: "center", marginRight: 12 },
  coverIcon: { fontSize: 30 },
  bookInfo: { flex: 1, justifyContent: "center" },
  bookTitle: { color: "#183b29", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  bookAuthor: { color: "#9a7834", fontWeight: "700", fontSize: 13, marginBottom: 3 },
  muted: { color: "#6f7d74", fontSize: 12, marginTop: 2 },
  price: { color: "#176b40", fontSize: 13, fontWeight: "900", marginTop: 7 },
  reader: { flex: 1, backgroundColor: "#fff" },
  readerHeader: { minHeight: 54, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e4ebe6" },
  readerTitle: { flex: 1, color: "#183b29", fontWeight: "800", fontSize: 15, marginLeft: 12 },
  readerTools: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1 },
  readerToolLabel: { fontSize: 12, fontWeight: "800", marginRight: 2 },
  themeButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  fontButton: { borderRadius: 8, minWidth: 38, alignItems: "center", paddingHorizontal: 9, paddingVertical: 8 },
  pdf: { flex: 1, width: "100%" },
  textReader: { flex: 1 },
  textPageContent: { padding: 20, paddingBottom: 40 },
  pageText: { color: "#202820", fontSize: 17, lineHeight: 29, textAlign: "left" },
  pageControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderTopWidth: 1, borderTopColor: "#e5eae6" },
  pageNumber: { color: "#526258", fontSize: 12, fontWeight: "700" },
});
