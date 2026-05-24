import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  NativeModules,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {
  PaymentSDKBillingDetails,
  PaymentSDKConfiguration,
  RNPaymentSDKLibrary,
} from '@paytabs/react-native-paytabs';

type PaymentResult = {
  status: 'success' | 'cancelled' | 'error' | 'native_crash';
  message: string;
  raw?: unknown;
};

type DiagnosticLine = {
  id: string;
  level: 'info' | 'warn' | 'error';
  text: string;
};

const PAYTABS_NATIVE_MODULE = 'RNPaymentManager';

function buildConfiguration(): PaymentSDKConfiguration {
  const billingDetails = new PaymentSDKBillingDetails();
  billingDetails.name = 'John Smith';
  billingDetails.email = 'john@example.com';
  billingDetails.phone = '+201111111111';
  billingDetails.addressLine = '123 Demo Street';
  billingDetails.city = 'Dubai';
  billingDetails.state = 'Dubai';
  billingDetails.countryCode = 'ae';
  billingDetails.zip = '12345';

  const configuration = new PaymentSDKConfiguration();
  configuration.profileID = 'YOUR_PROFILE_ID';
  configuration.serverKey = 'YOUR_SERVER_KEY';
  configuration.clientKey = 'YOUR_CLIENT_KEY';
  configuration.cartID = `CART_${Date.now()}`;
  configuration.currency = 'AED';
  configuration.cartDescription = 'Demo purchase - PayTabs RN';
  configuration.merchantCountryCode = 'ae';
  configuration.merchantName = 'PayTab Demo Store';
  configuration.amount = 1.0;
  configuration.screenTitle = 'Pay with Card';
  configuration.billingDetails = billingDetails;
  configuration.showBillingInfo = true;
  configuration.forceShippingInfo = false;

  return configuration;
}

/** Turn any thrown/rejected value into a readable string for the UI. */
function formatPayTabsError(error: unknown): string {
  if (error == null) {
    return 'Unknown error (null).';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    const parts = [error.message];
    if (error.name && error.name !== 'Error') {
      parts.unshift(`${error.name}:`);
    }
    if (error.stack) {
      parts.push(`\n\nStack:\n${error.stack}`);
    }
    return parts.join(' ');
  }
  const anyErr = error as Record<string, unknown>;
  const code =
    anyErr.code ?? anyErr.errorCode ?? anyErr.nativeErrorCode ?? anyErr.errorCode;
  const message =
    anyErr.message ??
    anyErr.msg ??
    anyErr.localizedDescription ??
    anyErr.userInfo ??
    'Unknown error from PayTabs SDK.';
  const userInfo = anyErr.userInfo ?? anyErr.nativeStackAndroid;
  let out = code != null ? `[${String(code)}] ${String(message)}` : String(message);
  if (userInfo != null) {
    try {
      out += `\n\nDetails:\n${JSON.stringify(userInfo, null, 2)}`;
    } catch {
      out += `\n\nDetails: ${String(userInfo)}`;
    }
  }
  try {
    out += `\n\nFull payload:\n${JSON.stringify(error, null, 2)}`;
  } catch {
    // ignore circular refs
  }
  return out;
}

function runPreflightChecks(): DiagnosticLine[] {
  const lines: DiagnosticLine[] = [];

  lines.push({
    id: 'platform',
    level: 'info',
    text: `Platform: ${Platform.OS} ${String(Platform.Version)}`,
  });

  const nativeModule = NativeModules[PAYTABS_NATIVE_MODULE];
  if (nativeModule == null) {
    lines.push({
      id: 'native-module',
      level: 'error',
      text: `Native module "${PAYTABS_NATIVE_MODULE}" is missing. Rebuild the app (cd android && ./gradlew clean, then npx react-native run-android).`,
    });
  } else {
    const methods = Object.keys(nativeModule).filter(
      k => typeof nativeModule[k] === 'function',
    );
    lines.push({
      id: 'native-module',
      level: 'info',
      text: `Native module OK. Methods: ${methods.join(', ') || '(none)'}`,
    });
  }

  if (typeof RNPaymentSDKLibrary?.startCardPayment !== 'function') {
    lines.push({
      id: 'bridge',
      level: 'error',
      text: 'RNPaymentSDKLibrary.startCardPayment is not a function.',
    });
  }

  if (Platform.OS === 'android') {
    lines.push({
      id: 'android-note',
      level: 'warn',
      text:
        'If the whole app closes on Pay Now (no JS error), that is a native crash in PayTabs PaymentSdkActivity — check Metro/logcat. Common fix: androidx.core must be 1.17+ (see android/build.gradle).',
    });
  }

  return lines;
}

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticLine[]>(() =>
    runPreflightChecks(),
  );
  const paymentInFlight = useRef(false);
  const appStateBeforePayment = useRef<AppStateStatus>(AppState.currentState);

  const appendDiagnostic = useCallback((line: DiagnosticLine) => {
    setDiagnostics(prev => [...prev, line]);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (!paymentInFlight.current) {
        appStateBeforePayment.current = nextState;
        return;
      }
      // Payment screen opened → app often goes to background; returning without
      // a promise result may mean a native crash killed the JS bridge.
      if (
        appStateBeforePayment.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        appendDiagnostic({
          id: `appstate-${Date.now()}`,
          level: 'info',
          text: `App returned to foreground (${nextState}). Waiting for PayTabs promise…`,
        });
      }
      appStateBeforePayment.current = nextState;
    });
    return () => subscription.remove();
  }, [appendDiagnostic]);

  const startPayment = async () => {
    setLoading(true);
    setResult(null);
    setDiagnostics(runPreflightChecks());
    paymentInFlight.current = true;

    const preflight = runPreflightChecks();
    const blocking = preflight.filter(l => l.level === 'error');
    if (blocking.length > 0) {
      const message = blocking.map(l => l.text).join('\n\n');
      setResult({status: 'error', message, raw: {preflight}});
      Alert.alert('Cannot start payment', message);
      setLoading(false);
      paymentInFlight.current = false;
      return;
    }

    let configurationJson = '';
    try {
      const configuration = buildConfiguration();
      configurationJson = JSON.stringify(configuration);
      appendDiagnostic({
        id: 'config',
        level: 'info',
        text: `Config built (cartID=${configuration.cartID}, amount=${configuration.amount} ${configuration.currency}).`,
      });
    } catch (error) {
      const message = formatPayTabsError(error);
      console.error('[PayTabs] buildConfiguration failed:', error);
      setResult({
        status: 'error',
        message: `Failed to build payment config:\n${message}`,
        raw: error,
      });
      Alert.alert('Configuration error', message);
      setLoading(false);
      paymentInFlight.current = false;
      return;
    }

    try {
      appendDiagnostic({
        id: 'invoke',
        level: 'info',
        text: 'Calling RNPaymentSDKLibrary.startCardPayment…',
      });

      const response: unknown = await RNPaymentSDKLibrary.startCardPayment(
        configurationJson,
      );

      appendDiagnostic({
        id: 'response',
        level: 'info',
        text: `Native bridge returned: ${JSON.stringify(response)}`,
      });

      const res = response as Record<string, unknown> | null;

      if (res?.PaymentDetails != null) {
        setResult({
          status: 'success',
          message: 'Payment completed.',
          raw: res.PaymentDetails,
        });
      } else if (res?.Event === 'CancelPayment') {
        setResult({status: 'cancelled', message: 'Payment was cancelled.'});
      } else {
        setResult({
          status: 'error',
          message: 'Unexpected response from PayTabs SDK.',
          raw: response,
        });
      }
    } catch (error) {
      const message = formatPayTabsError(error);
      console.error('[PayTabs] startCardPayment rejected:', error);
      appendDiagnostic({
        id: 'catch',
        level: 'error',
        text: `Promise rejected: ${message}`,
      });
      setResult({
        status: 'error',
        message: `PayTabs error:\n${message}`,
        raw: error,
      });
      Alert.alert('Payment failed (JS)', message.slice(0, 500));
    } finally {
      setLoading(false);
      paymentInFlight.current = false;
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={[styles.safeArea, {backgroundColor: theme.background}]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, {color: theme.text}]}>PayTabs Demo</Text>
        <Text style={[styles.subtitle, {color: theme.subtext}]}>
          React Native + @paytabs/react-native-paytabs
        </Text>

        <View style={[styles.card, {backgroundColor: theme.card}]}>
          <Text style={[styles.cardLabel, {color: theme.subtext}]}>Item</Text>
          <Text style={[styles.cardValue, {color: theme.text}]}>
            Demo purchase
          </Text>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={[styles.cardLabel, {color: theme.subtext}]}>
                Amount
              </Text>
              <Text style={[styles.cardValue, {color: theme.text}]}>
                1.00 AED
              </Text>
            </View>
            <View style={styles.col}>
              <Text style={[styles.cardLabel, {color: theme.subtext}]}>
                Region
              </Text>
              <Text style={[styles.cardValue, {color: theme.text}]}>UAE</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={startPayment}
          style={[
            styles.button,
            {backgroundColor: loading ? theme.buttonDisabled : theme.button},
          ]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Pay Now</Text>
          )}
        </TouchableOpacity>

        <View style={[styles.diagBox, {backgroundColor: theme.card}]}>
          <Text style={[styles.diagTitle, {color: theme.text}]}>
            Diagnostics
          </Text>
          {diagnostics.map(line => (
            <Text
              key={line.id}
              style={[
                styles.diagLine,
                {
                  color:
                    line.level === 'error'
                      ? '#ef4444'
                      : line.level === 'warn'
                      ? '#f59e0b'
                      : theme.subtext,
                },
              ]}>
              {line.text}
            </Text>
          ))}
        </View>

        {result && (
          <View
            style={[
              styles.resultBox,
              {
                backgroundColor: theme.card,
                borderColor:
                  result.status === 'success'
                    ? '#22c55e'
                    : result.status === 'cancelled'
                    ? '#f59e0b'
                    : '#ef4444',
              },
            ]}>
            <Text style={[styles.resultTitle, {color: theme.text}]}>
              {result.status.toUpperCase()}
            </Text>
            <Text style={[styles.resultMessage, {color: theme.subtext}]}>
              {result.message}
            </Text>
            {result.raw !== undefined && (
              <Text style={[styles.resultRaw, {color: theme.subtext}]}>
                {JSON.stringify(result.raw, null, 2)}
              </Text>
            )}
          </View>
        )}

        <Text style={[styles.footnote, {color: theme.subtext}]}>
          Replace placeholder credentials in App.tsx before a real payment. If
          Android closes instantly on Pay Now, run: adb logcat -b crash -d
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const lightTheme = {
  background: '#f5f6fa',
  card: '#ffffff',
  text: '#0f172a',
  subtext: '#475569',
  button: '#2563eb',
  buttonDisabled: '#93c5fd',
};

const darkTheme = {
  background: '#0b1220',
  card: '#111827',
  text: '#f8fafc',
  subtext: '#94a3b8',
  button: '#3b82f6',
  buttonDisabled: '#1e3a8a',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginTop: 4,
  },
  col: {
    flex: 1,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  diagBox: {
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
  },
  diagTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  diagLine: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  resultBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  resultMessage: {
    fontSize: 14,
    marginTop: 6,
  },
  resultRaw: {
    fontSize: 12,
    marginTop: 12,
    fontFamily: 'Courier',
  },
  footnote: {
    fontSize: 12,
    marginTop: 32,
    lineHeight: 18,
  },
});

export default App;
