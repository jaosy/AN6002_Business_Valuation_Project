from flask import Flask, render_template, request
import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import io
import base64

app = Flask(__name__)

company_dict = {
  "Information Technology": {
      "IBM": "IBM",
      "Intel": "INTC",
      "Microsoft": "MSFT",
      "Nvidia": "NVDA",
      "ServiceNow": "NOW",
  },
  "Health Care": {
      "AbbVie": "ABBV",
      "Cigna": "CI",
      "IQVIA": "IQV",
      "Eli Lilly": "LLY",
      "Pfizer": "PFE",
  },
  "Finance": {
      "JP Morgan Chase": "JPM",
      "PayPal": "PYPL",
      "Visa Inc": "V",
      "Goldman Sachs": "GS",
      "American Express": "AXP",
  },
}

valid_time_periods = {
  "1 day": "1d",
  "5 days": "5d",
  "1 month": "1mo",
  "3 months": "3mo",
  "6 months": "6mo",
  "1 year": "1y",
  "2 years": "2y",
  "5 years": "5y",
  "10 years": "10y",
  "Year to date": "ytd",
  "All time": "max",
}

@app.route('/', methods=['GET', 'POST'])
def index():
  if request.method == 'POST':
      industry = request.form.get('industry')
      company = request.form.get('company')
      time_period = request.form.get('time_period')
      ticker_symbol = company_dict[industry][company]
      
      # Fetch stock data
      stock_data = yf.Ticker(ticker_symbol).history(period=valid_time_periods[time_period])
      
      # Generate plots
      plot_url = generate_timeseries_plot(stock_data, company)
      
      # Get company summary
      summary_data = get_company_summary(ticker_symbol, company, time_period)
      
      return render_template('result.html', industry=industry, company=company, time_period=time_period, ticker_symbol=ticker_symbol, plot_url=plot_url, summary_data=summary_data)
  
  return render_template('index.html', industries=company_dict, time_periods=valid_time_periods)

def generate_timeseries_plot(df, choosen_company):
  fig = plt.figure(figsize=(10, 5))
  plt.plot(df["Close"], color="Green", linewidth=1, label="Price")
  
  # Find max and min values
  max_value = df["Close"].max()
  max_date = df["Close"].idxmax()
  min_value = df["Close"].min()
  min_date = df["Close"].idxmin()

  # Mark max and min points
  plt.plot(max_date, max_value, "bo")  # Blue circle for max
  plt.plot(min_date, min_value, "rx")  # Red cross for min

  # Annotate max and min values
  plt.annotate(f"Max: {max_value:.2f}\n{max_date.date()}", xy=(max_date, max_value), xytext=(max_date, max_value - (max_value - min_value) * 0.05), horizontalalignment="left")
  plt.annotate(f"Min: {min_value:.2f}\n{min_date.date()}", xy=(min_date, min_value), xytext=(min_date, min_value - (max_value - min_value) * 0.01), horizontalalignment="left")

  plt.legend()
  plt.xlabel("Date")
  plt.ylabel("Price (US$)")
  plt.title(f"Stock Price Time Series for {choosen_company}")
  
  # Save plot to a BytesIO object
  img = io.BytesIO()
  plt.savefig(img, format='png')
  img.seek(0)
  plot_url = base64.b64encode(img.getvalue()).decode()  # Encode to base64
  plt.close(fig)  # Close the figure to free memory
  return plot_url

def get_company_summary(ticker_symbol, choosen_company, time="1d"):
  """Fetch and return company summary information using yfinance."""
  company = yf.Ticker(ticker_symbol)
  stock_data = company.history(period=str(time))
  info = company.info

  # Create a summary dictionary
  summary = {
      "P/E Ratio": info.get("trailingPE", "N/A"),
      "High": stock_data["High"].iloc[-1] if not stock_data.empty else "N/A",
      "Low": stock_data["Low"].iloc[-1] if not stock_data.empty else "N/A",
      "Current Price": stock_data["Close"].iloc[-1] if not stock_data.empty else "N/A",
      "Market Cap": info.get("marketCap", "N/A"),
      "EPS": info.get("trailingEps", "N/A"),
      "Gross Profit": company.financials.loc["Gross Profit"][0] if "Gross Profit" in company.financials.index else "N/A",
      "Pre-tax Income": company.financials.loc["Pretax Income"][0] if "Pretax Income" in company.financials.index else "N/A",
      "EBITDA": company.financials.loc["EBITDA"][0] if "EBITDA" in company.financials.index else "N/A",
      "Total Liabilities": company.balance_sheet.loc["Total Liabilities Net Minority Interest"][0] if "Total Liabilities Net Minority Interest" in company.balance_sheet.index else "N/A",
      "Total Assets": company.balance_sheet.loc["Total Assets"][0] if "Total Assets" in company.balance_sheet.index else "N/A",
      "End Cash Position": company.cashflow.loc["End Cash Position"][0] if "End Cash Position" in company.cashflow.index else "N/A",
  }

  return summary

if __name__ == '__main__':
  app.run(debug=True)