// app/(auth)/login.tsx
import { useState } from 'react'
import { View, TextInput, Button, Text } from 'react-native'
import { router, Link } from 'expo-router'
import { useAuth } from '../../lib/AuthContext'

export default function Login() {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSignUp = async () => {
    const { error } = await signUp(email, password)
    if (error) {
      setError(error.message)
    }
  }

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text>{error}</Text> : null}
      <Button title="Sign Up" onPress={handleSignUp} />
      <Link href="/(auth)/login">
        <Text style={{ color: '#007AFF', marginTop: 12}}>
          Already have an account? Log in
        </Text>
      </Link>
    </View>
  )
}