// app/(auth)/login.tsx
import { useState } from 'react'
import { View, TextInput, Button, Text } from 'react-native'
import { router, Link } from 'expo-router'
import { useAuth } from '../../lib/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
    }
  }

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text>{error}</Text> : null}
      <Button title="Log In" onPress={handleLogin} />

      <Link href="/(auth)/signup">
        <Text style={{ color: '#007AFF', marginTop: 12}}>
          Dont' have an account? Sign Up
        </Text>
      </Link>
    </View>
  )
}