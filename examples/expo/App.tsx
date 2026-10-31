import { createQuarantine, Quarantine, QuarantineProvider } from '@helder-studio/quarantine';
import { asyncStorage } from '@helder-studio/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

const quarantine = createQuarantine({
  storage: asyncStorage(AsyncStorage),
  appVersion: Application.nativeApplicationVersion ?? '1.0.0', // a new build clears quarantines
  quarantineInDev: true, // so the demo also quarantines in a dev build
  onQuarantine: (e) => console.info('feature_quarantined', e),
});

function FlakyWidget() {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error('FlakyWidget crashed');
  return (
    <View style={[styles.box, styles.ok]}>
      <Text style={styles.title}>Recommended for you</Text>
      <Text>This widget works until you break it.</Text>
      <Button title="Crash the widget" onPress={() => setBroken(true)} />
    </View>
  );
}

export default function App() {
  return (
    <QuarantineProvider value={quarantine}>
      <View style={styles.screen}>
        <Text style={styles.heading}>@helder-studio/quarantine</Text>
        <Text>
          Crash the widget 3 times within a minute and it switches off for 30 seconds, even after
          you restart the app. The rest of the screen keeps working.
        </Text>
        <Quarantine
          id="recommendations"
          maxCrashes={3}
          window="1m"
          cooldown="30s"
          fallback={
            <View style={[styles.box, styles.off]}>
              <Text>Recommendations are switched off for now.</Text>
            </View>
          }
          retryFallback={(retry) => (
            <View style={[styles.box, styles.warn]}>
              <Text>The widget crashed.</Text>
              <Button title="Try again" onPress={retry} />
            </View>
          )}
        >
          <FlakyWidget />
        </Quarantine>
        <Button
          title="Reset demo (then restart the app)"
          onPress={() => AsyncStorage.removeItem('helder-studio:quarantine')} // takes effect on the next app start
        />
      </View>
    </QuarantineProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 72, gap: 12 },
  heading: { fontSize: 20, fontWeight: '600' },
  title: { fontWeight: '600' },
  box: { padding: 16, borderRadius: 8, gap: 8 },
  ok: { backgroundColor: '#e6f4ea' },
  warn: { backgroundColor: '#fff4e5' },
  off: { backgroundColor: '#fdecea' },
});
