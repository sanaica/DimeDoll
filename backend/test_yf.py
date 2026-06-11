import yfinance as yf

tickers = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"]
data = yf.download(tickers=tickers, period="1d", interval="1m", progress=False)
print("Columns:")
print(data.columns)
print("Close Data:")
print(data['Close'].tail())
