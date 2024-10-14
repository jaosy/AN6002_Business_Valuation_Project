import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)
warnings.simplefilter(action='ignore', category=UserWarning)

import yfinance as yf
import pickle
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from keras.models import Sequential
from keras.layers import LSTM, Dense, Dropout
import matplotlib.pyplot as plt

# Fetch S&P 500 tickers from Wikipedia
def get_sp500_tickers():
    url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'
    tables = pd.read_html(url)
    df = tables[0]
    tickers = df['Symbol'].tolist()
    return tickers

# Create sequences for LSTM
def create_sequences(data, seq_length):
    sequences = []
    labels = []
    for i in range(len(data) - seq_length):
        sequences.append(data[i:i + seq_length])
        labels.append(data[i + seq_length])
    return np.array(sequences), np.array(labels)

# Prepare data for all tickers and combine
def prepare_combined_data(tickers, seq_length):
    all_sequences = []
    all_labels = []

    for ticker in tickers:
        try:
            print(f"Processing {ticker}...")
            stock_data = yf.download(ticker, start="2010-01-01", end="2024-10-01")

            if stock_data.empty:
                print(f"No data found for {ticker}")
                continue

            # 'Date' is already the index, no need to set it manually
            prices = stock_data['Close'].values.reshape(-1, 1)

            # Scale the data
            scaler = MinMaxScaler()
            scaled_prices = scaler.fit_transform(prices)

            # Create sequences
            sequences, labels = create_sequences(scaled_prices, seq_length)

            # Check if sequences have the correct shape before appending
            if sequences.ndim == 3 and labels.ndim == 2: # Add this condition
                all_sequences.append(sequences)
                all_labels.append(labels)
            else:
                print(f"Skipping {ticker} due to incorrect sequence shape: {sequences.shape}, {labels.shape}")

        except Exception as e:
            print(f"Error processing {ticker}: {e}")

    # Combine all sequences and labels from different tickers
    if len(all_sequences) == 0:
        print("No valid stock data available.")
        return None, None

    all_sequences = np.vstack(all_sequences)
    all_labels = np.vstack(all_labels) # Change hstack to vstack for labels as well

    return all_sequences, all_labels

# Train a single LSTM model for all S&P 500 stocks
def train_combined_lstm_model(seq_length=60, epochs=10, batch_size=32):
    tickers = get_sp500_tickers()

    # Prepare data for all tickers
    X_train, y_train = prepare_combined_data(tickers, seq_length)

    if X_train is None or y_train is None:
        print("No training data available. Exiting.")
        return None

    # Reshape inputs for LSTM [samples, time steps, features]
    X_train = X_train.reshape((X_train.shape[0], X_train.shape[1], 1))

    # Build the LSTM model
    model = Sequential()
    model.add(LSTM(units=100, return_sequences=True, input_shape=(seq_length, 1)))
    model.add(Dropout(0.2))
    model.add(LSTM(units=100, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(25))
    model.add(Dense(1))

    # Compile the model
    model.compile(optimizer='adam', loss='mean_squared_error')

    # Train the model
    model.fit(X_train, y_train, epochs=epochs, batch_size=batch_size, verbose=1)

    # Save the model
    with open('combined_sp500_lstm_model.pkl', 'wb') as file:
        pickle.dump(model, file)

    # model.save('combined_sp500_lstm_model.h5')
    
    print("Combined model serialized by pickling")

    return model

# Predict using the combined model
def predict_stock_price_combined_model(ticker, model, seq_length=60):
    # Download stock data
    stock_data = yf.download(ticker, start="2010-01-01", end="2024-10-01")

    if stock_data.empty:
        print(f"No data found for {ticker}")
        return None

    # Close prices
    prices = stock_data['Close'].values.reshape(-1, 1)

    # Scale the data
    scaler = MinMaxScaler()
    scaled_prices = scaler.fit_transform(prices)

    # Create sequences for prediction
    test_data = scaled_prices[-(seq_length + 1):]
    X_test = np.array([test_data[:seq_length]])
    X_test = X_test.reshape((X_test.shape[0], X_test.shape[1], 1))

    # Predict and inverse transform to get actual prices
    predicted_scaled = model.predict(X_test)
    predicted_price = scaler.inverse_transform(predicted_scaled)

    return predicted_price[0][0]

# Main execution
if __name__ == '__main__':
    # Train the combined model
    combined_model = train_combined_lstm_model(seq_length=60, epochs=10, batch_size=32)

    # Example to predict stock price for a specific ticker using the combined model
    if combined_model:
        ticker_to_predict = 'AAPL'
        predicted_price = predict_stock_price_combined_model(ticker_to_predict, combined_model)
        if predicted_price:
            print(f"Predicted stock price for {ticker_to_predict}: {predicted_price}")