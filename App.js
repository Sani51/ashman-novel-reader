import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, StatusBar
} from "react-native";
import { supabase } from "./supabase";

const ADMIN_ID = "3d127987-ac50-4d49-9df8-fe8e52f1c67c";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  const isAdmin = session?.user?.id === ADMIN_ID;

  async function login() {
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) setMessage(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    setMessage("An fita daga asusu.");
  }

  async function addBook() {
    if (!title.trim() || !author.trim()) {
      setMessage("Ka saka sunan littafi da marubuci.");
      return;
    }

    if (isPaid && (!price || Number(price) <= 0)) {
      setMessage("Ka saka farashin littafin.");
      return;
    }

    const { error } = await supabase.from("books").insert([{
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      description: description.trim(),
      is_paid: isPaid,
      price: isPaid ? Number(price) : 0
    }]);

    if (error) {
      setMessage("An samu kuskure: " + error.message);
      return;
    }

    setMessage("An adana bayanan littafin cikin nasara!");
    setTitle("");
    setAuthor("");
    setCategory("");
    setDescription("");
    setPrice("");
    setIsPaid(false);
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
          <Text style={styles.welcome}>Admin Login</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.heading}>Shiga asusun Admin</Text>

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Shigar da email"
            placeholderTextColor="#777777"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Shigar da password"
            placeholderTextColor="#777777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={login}>
            <Text style={styles.buttonText}>Shiga</Text>
          </TouchableOpacity>

          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Ba ka da izinin Admin.</Text>
        <TouchableOpacity style={styles.button} onPress={logout}>
          <Text style={styles.buttonText}>Fita</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

        <Text style={styles.fieldLabel}>
          Book Title – Sunan littafi *
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Rubuta sunan littafi"
          placeholderTextColor="#777777"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.fieldLabel}>
          Author Name – Sunan marubuci *
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Rubuta sunan marubuci"
          placeholderTextColor="#777777"
          value={author}
          onChangeText={setAuthor}
        />

        <Text style={styles.fieldLabel}>
          Category – Rukunin littafi (Ba dole ba ne)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Misali: Soyayya, Tarihi, Addini"
          placeholderTextColor="#777777"
          value={category}
          onChangeText={setCategory}
        />

        <Text style={styles.fieldLabel}>
          Book Description – Bayanin littafi (Ba dole ba ne)
        </Text>
        <TextInput
          style={[styles.input, styles.description]}
          placeholder="Rubuta taƙaitaccen bayanin littafi"
          placeholderTextColor="#777777"
          value={description}
          onChangeText={setDescription}
          multiline
        />

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
              placeholder="Shigar da farashi a Naira"
              placeholderTextColor="#777777"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={addBook}>
          <Text style={styles.buttonText}>Ajiye littafi</Text>
        </TouchableOpacity>

        <Text style={styles.message}>{message}</Text>

        <TouchableOpacity style={styles.logout} onPress={logout}>
          <Text style={styles.buttonText}>Fita daga Admin</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F5"
  },
  header: {
    backgroundColor: "#102B24",
    padding: 28,
    paddingTop: 45,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25
  },
  logo: {
    color: "#FFF",
    fontSize: 27,
    fontWeight: "bold"
  },
  subtitle: {
    color: "#D6B56D",
    fontSize: 13,
    letterSpacing: 3
  },
  welcome: {
    color: "#FFF",
    marginTop: 20,
    fontSize: 17
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  heading: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#102B24",
    marginBottom: 18
  },
  fieldLabel: {
    color: "#102B24",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 5
  },
  input: {
    backgroundColor: "#FFFFFF",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    color: "#222222",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#D8DED9"
  },
  description: {
    minHeight: 100,
    textAlignVertical: "top"
  },
  choices: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15
  },
  choice: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#DDD",
    alignItems: "center"
  },
  selected: {
    backgroundColor: "#D6B56D"
  },
  choiceText: {
    color: "#102B24",
    fontWeight: "bold"
  },
  button: {
    backgroundColor: "#102B24",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "bold"
  },
  message: {
    color: "#9A6B20",
    marginTop: 15,
    textAlign: "center"
  },
  logout: {
    backgroundColor: "#8B2929",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20
  }
});
