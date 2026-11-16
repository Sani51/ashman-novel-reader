
import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, StatusBar, Linking
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const ADMIN_ID = "3d127987-ac50-4d49-9df8-fe8e52f1c67c";
const BUCKET = "novel-files";
const REDIRECT_URL = "ashmannovellibrary://auth/callback";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [books, setBooks] = useState([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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
    let active = true;

    async function handleAuthLink(url) {
      if (!url) return;

      const match = url.match(/[?&]code=([^&]+)/);
      if (!match) return;

      const code = decodeURIComponent(match[1]);

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (active && error) {
        setMessage("Tabbatarwar Gmail ta samu matsala: " + error.message);
      } else if (active && !error) {
        setMessage("An tabbatar da email ɗinka cikin nasara.");
      }
    }

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleAuthLink(url);
    });

    Linking.getInitialURL().then(handleAuthLink);

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      if (error) {
        setMessage("An kasa buɗe account: " + error.message);
      }

      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (active) setSession(newSession);
      }
    );

    return () => {
      active = false;
      subscription.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && !isAdmin) loadBooks();
  }, [session]);

  async function loadBooks() {
    const { data, error } = await supabase
      .from("books")
      .select("id,title,author,category,description,is_paid,price,cover_image_url")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("An kasa samun littattafai: " + error.message);
      return;
    }

    setBooks(data || []);
  }

  async function register() {
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Ka cika email da password.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password ya zama aƙalla haruffa 6.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: REDIRECT_URL
      }
    });

    setSaving(false);

    if (error) {
      setMessage("An samu kuskure: " + error.message);
      return;
    }

    if (data.session) {
      setMessage("An ƙirƙiri account. Kana iya shiga yanzu.");
    } else {
      setMessage(
        "An aika saƙon tabbatarwa zuwa email ɗinka. Ka buɗe Gmail ka danna link ɗin tabbatarwa."
      );
    }

    setMode("login");
  }

  async function login() {
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Ka shigar da email da password.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setSaving(false);

    if (error) {
      setMessage("Shiga bai yiwu ba: " + error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessage("An fita daga asusu.");
    setMode("login");
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true
    });

    if (!result.canceled) {
      setPdf(result.assets[0]);
      setMessage("An zaɓi PDF cikin nasara.");
    }
  }

  async function chooseCover() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage("Ka ba app izinin shiga hotunanka.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8
    });

    if (!result.canceled) {
      setCover(result.assets[0]);
      setMessage("An zaɓi hoton littafi.");
    }
  }

  async function uploadFile(file, folder, contentType) {
    const response = await fetch(file.uri);
    const arrayBuffer = await response.arrayBuffer();

    const originalName = file.name || file.fileName || "file";
    const extension = originalName.split(".").pop().toLowerCase();
    const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "bin";

    const path = `${folder}/${Date.now()}-${Math.random()
      .toString(36).slice(2)}.${safeExtension}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(arrayBuffer), {
        contentType,
        upsert: false
      });

    if (error) throw error;

    return path;
  }

  async function addBook() {
    if (!title.trim() || !author.trim()) {
      setMessage("Ka saka sunan littafi da marubuci.");
      return;
    }

    if (!pdf) {
      setMessage("Dole ne ka zaɓi PDF na littafin.");
      return;
    }

    if (isPaid && (!price || Number(price) <= 0)) {
      setMessage("Ka saka farashin littafin.");
      return;
    }

    setSaving(true);
    setMessage("Ana loda littafi...");

    try {
      const pdfPath = await uploadFile(
        pdf, "pdfs", "application/pdf"
      );

      let coverPath = null;

      if (cover) {
        coverPath = await uploadFile(
          cover, "covers", cover.mimeType || "image/jpeg"
        );
      }

      const { error } = await supabase.from("books").insert([{
        title: title.trim(),
        author: author.trim(),
        category: category.trim(),
        description: description.trim(),
        file_url: pdfPath,
        cover_image_url: coverPath,
        file_type: "pdf",
        is_paid: isPaid,
        price: isPaid ? Number(price) : 0
      }]);

      if (error) throw error;

      setMessage("An adana littafin cikin nasara!");
      setTitle("");
      setAuthor("");
      setCategory("");
      setDescription("");
      setPrice("");
      setIsPaid(false);
      setPdf(null);
      setCover(null);
    } catch (error) {
      setMessage("An samu kuskure: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" />;
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor="#102B24" barStyle="light-content" />

        <View style={styles.header}>
          <Text style={styles.logo}>ASHMAN</Text>
          <Text style={styles.subtitle}>NOVEL LIBRARY</Text>
          <Text style={styles.welcome}>Karatu cikin sauƙi</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.heading}>
            {mode === "register" ? "Ƙirƙiri sabon account" : "Shiga account"}
          </Text>

          <Text style={styles.fieldLabel}>Email / Gmail</Text>
          <TextInput
            style={styles.input}
            placeholder="Shigar da email ɗinka"
            placeholderTextColor="#777"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Shigar da password"
            placeholderTextColor="#777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, saving && styles.disabled]}
            onPress={mode === "register" ? register : login}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? "Ana jira..." :
                mode === "register" ? "Yi rajista" : "Shiga"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setMessage("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            <Text style={styles.switchText}>
              {mode === "register"
                ? "Kana da account? Shiga"
                : "Ba ka da account? Yi rajista"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    );
  }

  if (isAdmin) {
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor="#102B24" barStyle="light-content" />

        <View style={styles.header}>
          <Text style={styles.logo}>ASHMAN</Text>
          <Text style={styles.subtitle}>ADMIN DASHBOARD</Text>
          <Text style={styles.welcome}>Barka da zuwa, Admin</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Ƙara sabon littafi</Text>

          <Text style={styles.fieldLabel}>Book Title – Sunan littafi *</Text>
          <TextInput
            style={styles.input}
            placeholder="Rubuta sunan littafi"
            placeholderTextColor="#777"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.fieldLabel}>Author Name – Sunan marubuci *</Text>
          <TextInput
            style={styles.input}
            placeholder="Rubuta sunan marubuci"
            placeholderTextColor="#777"
            value={author}
            onChangeText={setAuthor}
          />

          <Text style={styles.fieldLabel}>Category – Rukunin littafi (Ba dole ba ne)</Text>
          <TextInput
            style={styles.input}
            placeholder="Misali: Soyayya, Tarihi, Addini"
            placeholderTextColor="#777"
            value={category}
            onChangeText={setCategory}
          />

          <Text style={styles.fieldLabel}>Book Description – Bayanin littafi (Ba dole ba ne)</Text>
          <TextInput
            style={[styles.input, styles.description]}
            placeholder="Taƙaitaccen bayanin littafi"
            placeholderTextColor="#777"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={styles.fieldLabel}>Cover Image – Hoton bangon littafi</Text>
          <TouchableOpacity style={styles.pickButton} onPress={chooseCover}>
            <Text style={styles.pickText}>
              {cover ? "An zaɓi hoton ✓" : "Zaɓi hoton littafi"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Upload PDF – Ɗora littafin PDF *</Text>
          <TouchableOpacity style={styles.pickButton} onPress={choosePdf}>
            <Text style={styles.pickText}>
              {pdf ? pdf.name : "Zaɓi PDF daga wayarka"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Nau'in littafi</Text>
          <View style={styles.choices}>
            <TouchableOpacity
              style={[styles.choice, !isPaid && styles.selected]}
              onPress={() => setIsPaid(false)}
            >
              <Text style={styles.choiceText}>Kyauta</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choice, isPaid && styles.selected]}
              onPress={() => setIsPaid(true)}
            >
              <Text style={styles.choiceText}>Mai kuɗi</Text>
            </TouchableOpacity>
          </View>

          {isPaid && (
            <>
              <Text style={styles.fieldLabel}>Price – Farashi (₦)</Text>
              <TextInput
                style={styles.input}
                placeholder="Shigar da farashi"
                placeholderTextColor="#777"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, saving && styles.disabled]}
            onPress={addBook}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? "Ana loda littafi..." : "Ajiye littafi"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.logout} onPress={logout}>
            <Text style={styles.buttonText}>Fita daga Admin</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#102B24" barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.logo}>ASHMAN</Text>
        <Text style={styles.subtitle}>NOVEL LIBRARY</Text>
        <Text style={styles.welcome}>Barka da zuwa Library</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Littattafanmu</Text>
        <Text style={styles.fieldLabel}>
          Ka zaɓi littafin da kake son karantawa.
        </Text>

        {books.length === 0 ? (
          <Text style={styles.message}>Babu littattafai a yanzu.</Text>
        ) : (
          books.map((book) => (
            <View key={book.id} style={styles.bookCard}>
              <Text style={styles.bookTitle}>{book.title}</Text>
              <Text style={styles.bookAuthor}>Marubuci: {book.author}</Text>

              {!!book.category && (
                <Text style={styles.bookInfo}>Rukuni: {book.category}</Text>
              )}

              {!!book.description && (
                <Text style={styles.bookInfo}>{book.description}</Text>
              )}

              <Text style={styles.bookInfo}>
                {book.is_paid ? `Mai kuɗi: ₦${book.price}` : "Kyauta"}
              </Text>

              <Text style={styles.bookInfo}>
                Za a kunna karatun littafi a mataki na gaba.
              </Text>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.pickButton} onPress={loadBooks}>
          <Text style={styles.pickText}>Sabunta jerin littattafai</Text>
        </TouchableOpacity>

        <Text style={styles.message}>{message}</Text>

        <TouchableOpacity style={styles.logout} onPress={logout}>
          <Text style={styles.buttonText}>Fita daga account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7F5" },
  header: {
    backgroundColor: "#102B24", padding: 28, paddingTop: 45,
    borderBottomLeftRadius: 25, borderBottomRightRadius: 25
  },
  logo: { color: "#FFF", fontSize: 27, fontWeight: "bold" },
  subtitle: { color: "#D6B56D", fontSize: 13, letterSpacing: 3 },
  welcome: { color: "#FFF", marginTop: 20, fontSize: 17 },
  content: { padding: 20, paddingBottom: 40 },
  heading: {
    fontSize: 21, fontWeight: "bold", color: "#102B24",
    marginBottom: 18
  },
  fieldLabel: {
    color: "#102B24", fontSize: 15, fontWeight: "bold",
    marginBottom: 8, marginTop: 5
  },
  input: {
    backgroundColor: "#FFF", padding: 15, borderRadius: 10,
    marginBottom: 15, color: "#222", fontSize: 16,
    borderWidth: 1, borderColor: "#D8DED9"
  },
  description: { minHeight: 100, textAlignVertical: "top" },
  pickButton: {
    backgroundColor: "#E5EFE9", padding: 16,
    borderRadius: 10, marginBottom: 16,
    borderWidth: 1, borderColor: "#A9C5B4"
  },
  pickText: { color: "#102B24", fontWeight: "bold" },
  choices: { flexDirection: "row", gap: 10, marginBottom: 15 },
  choice: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: "#DDD", alignItems: "center"
  },
  selected: { backgroundColor: "#D6B56D" },
  choiceText: { color: "#102B24", fontWeight: "bold" },
  button: {
    backgroundColor: "#102B24", padding: 15,
    borderRadius: 10, alignItems: "center", marginTop: 8
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#FFF", fontWeight: "bold" },
  message: { color: "#9A6B20", marginTop: 15, textAlign: "center" },
  logout: {
    backgroundColor: "#8B2929", padding: 14,
    borderRadius: 10, alignItems: "center", marginTop: 20
  },
  switchButton: { padding: 14, alignItems: "center" },
  switchText: { color: "#176B4A", fontWeight: "bold" },
  bookCard: {
    backgroundColor: "#FFF", padding: 16, borderRadius: 12,
    marginBottom: 14, borderWidth: 1, borderColor: "#D8DED9"
  },
  bookTitle: { color: "#102B24", fontSize: 18, fontWeight: "bold" },
  bookAuthor: { color: "#444", marginTop: 6 },
  bookInfo: { color: "#555", marginTop: 7 }
});
style={styles.fieldLabel}>Cover Image – Hoton bangon littafi</Text>
          <TouchableOpacity style={styles.pickButton} onPress={chooseCover}>
            <Text style={styles.pickText}>
              {cover ? "An zaɓi hoton ✓" : "Zaɓi hoton littafi"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Upload PDF – Ɗora littafin PDF *</Text>
          <TouchableOpacity style={styles.pickButton} onPress={choosePdf}>
            <Text style={styles.pickText}>
              {pdf ? pdf.name : "Zaɓi PDF daga wayarka"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Nau'in littafi</Text>
          <View style={styles.choices}>
            <TouchableOpacity
              style={[styles.choice, !isPaid && styles.selected]}
              onPress={() => setIsPaid(false)}>
              <Text style={styles.choiceText}>Kyauta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choice, isPaid && styles.selected]}
              onPress={() => setIsPaid(true)}>
              <Text style={styles.choiceText}>Mai kuɗi</Text>
            </TouchableOpacity>
          </View>

          {isPaid && (
            <>
              <Text style={styles.fieldLabel}>Price – Farashi (₦)</Text>
              <TextInput style={styles.input} placeholder="Shigar da farashi"
                placeholderTextColor="#777" value={price}
                onChangeText={setPrice} keyboardType="numeric" />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, saving && styles.disabled]}
            onPress={addBook} disabled={saving}>
            <Text style={styles.buttonText}>
              {saving ? "Ana loda littafi..." : "Ajiye littafi"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.logout} onPress={logout}>
            <Text style={styles.buttonText}>Fita daga Admin</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#102B24" barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.logo}>ASHMAN</Text>
        <Text style={styles.subtitle}>NOVEL LIBRARY</Text>
        <Text style={styles.welcome}>Barka da zuwa Library</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Littattafanmu</Text>
        <Text style={styles.fieldLabel}>Ka zaɓi littafin da kake son karantawa.</Text>

        {books.length === 0 ? (
          <Text style={styles.message}>Babu littattafai a yanzu.</Text>
        ) : (
          books.map((book) => (
            <View key={book.id} style={styles.bookCard}>
              <Text style={styles.bookTitle}>{book.title}</Text>
              <Text style={styles.bookAuthor}>Marubuci: {book.author}</Text>
              {!!book.category && (
                <Text style={styles.bookInfo}>Rukuni: {book.category}</Text>
              )}
              {!!book.description && (
                <Text style={styles.bookInfo}>{book.description}</Text>
              )}
              <Text style={styles.bookInfo}>
                {book.is_paid ? `Mai kuɗi: ₦${book.price}` : "Kyauta"}
              </Text>
              <Text style={styles.bookInfo}>
                Za a kunna karatun littafi a mataki na gaba.
              </Text>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.pickButton} onPress={loadBooks}>
          <Text style={styles.pickText}>Sabunta jerin littattafai</Text>
        </TouchableOpacity>

        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity style={styles.logout} onPress={logout}>
          <Text style={styles.buttonText}>Fita daga account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7F5" },
  header: {
    backgroundColor: "#102B24", padding: 28, paddingTop: 45,
    borderBottomLeftRadius: 25, borderBottomRightRadius: 25
  },
  logo: { color: "#FFF", fontSize: 27, fontWeight: "bold" },
  subtitle: { color: "#D6B56D", fontSize: 13, letterSpacing: 3 },
  welcome: { color: "#FFF", marginTop: 20, fontSize: 17 },
  content: { padding: 20, paddingBottom: 40 },
  heading: {
    fontSize: 21, fontWeight: "bold", color: "#102B24",
    marginBottom: 18
  },
  fieldLabel: {
    color: "#102B24", fontSize: 15, fontWeight: "bold",
    marginBottom: 8, marginTop: 5
  },
  input: {
    backgroundColor: "#FFF", padding: 15, borderRadius: 10,
    marginBottom: 15, color: "#222", fontSize: 16,
    borderWidth: 1, borderColor: "#D8DED9"
  },
  description: { minHeight: 100, textAlignVertical: "top" },
  pickButton: {
    backgroundColor: "#E5EFE9", padding: 16,
    borderRadius: 10, marginBottom: 16,
    borderWidth: 1, borderColor: "#A9C5B4"
  },
  pickText: { color: "#102B24", fontWeight: "bold" },
  choices: { flexDirection: "row", gap: 10, marginBottom: 15 },
  choice: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: "#DDD", alignItems: "center"
  },
  selected: { backgroundColor: "#D6B56D" },
  choiceText: { color: "#102B24", fontWeight: "bold" },
  button: {
    backgroundColor: "#102B24", padding: 15,
    borderRadius: 10, alignItems: "center", marginTop: 8
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#FFF", fontWeight: "bold" },
  message: { color: "#9A6B20", marginTop: 15, textAlign: "center" },
  logout: {
    backgroundColor: "#8B2929", padding: 14,
    borderRadius: 10, alignItems: "center", marginTop: 20
  },
  switchButton: { padding: 14, alignItems: "center" },
  switchText: { color: "#176B4A", fontWeight: "bold" },
  bookCard: {
    backgroundColor: "#FFF", padding: 16, borderRadius: 12,
    marginBottom: 14, borderWidth: 1, borderColor: "#D8DED9"
  },
  bookTitle: { color: "#102B24", fontSize: 18, fontWeight: "bold" },
  bookAuthor: { color: "#444", marginTop: 6 },
  bookInfo: { color: "#555", marginTop: 7 }
});
