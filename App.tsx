
import React, {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
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
  status: 'success' | 'cancelled' | 'error';
  message: string;
  raw?: unknown;
};

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

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const startPayment = async () => {
    setLoading(true);
    setResult(null);
    try {
      const configuration = buildConfiguration();
      const response: any = await RNPaymentSDKLibrary.startCardPayment(
        JSON.stringify(configuration),
      );

      if (response?.PaymentDetails) {
        setResult({
          status: 'success',
          message: 'Payment completed.',
          raw: response.PaymentDetails,
        });
      } else if (response?.Event === 'CancelPayment') {
        setResult({status: 'cancelled', message: 'Payment was cancelled.'});
      } else {
        setResult({
          status: 'error',
          message: 'Unexpected response from PayTabs SDK.',
          raw: response,
        });
      }
    } catch (error: any) {
      const message =
        typeof error === 'string'
          ? error
          : error?.message ?? 'Unknown error from PayTabs SDK.';
      setResult({status: 'error', message, raw: error});
      Alert.alert('Payment failed', message);
    } finally {
      setLoading(false);
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
          Replace the placeholder credentials in App.tsx with your PayTabs
          profile ID, server key, and client key before testing a real payment.
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
  resultBox: {
    marginTop: 24,
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
