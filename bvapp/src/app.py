from flask import Flask, jsonify, request
import plotly.graph_objects as go
import plotly.offline as pyo
import plotly as plotly
import tempfile
import requests
import yfinance as yf
import pandas as pd
import numpy as np
import io
import base64
import matplotlib.pyplot as plt

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


@app.route("/api/stock-data", methods=["POST"])
def get_stock_data():

  data = request.json
  industry = data.get('industry')
  company = data.get('company')
  time_period = valid_time_periods[data.get('time_period')]
  ticker_symbol = company_dict[industry][company]
  
  # Fetch stock data
  stock_data = yf.Ticker(ticker_symbol).history(period=time_period)
  
  # Generate plots
  #plot_url = generate_timeseries_plot(stock_data, company)
  graphJSON = generate_timeseries_plot(stock_data, company)
  print(graphJSON)
  
  # Get company summary
  summary_data = get_company_summary(ticker_symbol, company, time_period)
  
  return jsonify({
      'company': company,
      'ticker_symbol': ticker_symbol,
      'plot_url': graphJSON,  # Return the HTML content
      'summary_data': summary_data
  })

    # Fetch stock data
    stock_data = yf.Ticker(ticker_symbol).history(period=time_period)

    # Generate plots
    plot_url = generate_timeseries_plot(stock_data, company)

    # Get company summary
    summary_data = get_company_summary(ticker_symbol, company, time_period)

    return jsonify(
        {
            "company": company,
            "ticker_symbol": ticker_symbol,
            "plot_url": plot_url,
            "summary_data": summary_data,
        }
    )


@app.route("/api/stock-valuation", methods=["POST"])
def stock_valuation():
    data = request.json
    company_name = data.get("company_name")  # Get the company name from the request

    if not company_name:
        return jsonify({"error": "Company name is required."}), 400

    # Get the ticker symbol using the get_ticker function
    ticker_input = get_ticker(company_name)
    ticker = ticker_input.upper()

    stock = yf.Ticker(ticker)
    info = stock.info

    income_stmt = stock.financials
    cash_flow = stock.cashflow
    balance_sheet = stock.balance_sheet

    if income_stmt.empty or cash_flow.empty or balance_sheet.empty:
        return jsonify({"error": "Financial data not available for this ticker."}), 400

    sector = info.get("sector", "Unknown")
    company_name = info.get("shortName", "Unknown")

    possible_operating_cf_keys = [
        "Total Cash From Operating Activities",
        "Net Cash Provided by Operating Activities",
        "Operating Cash Flow",
        "Cash from Operating Activities",
    ]

    possible_capex_keys = [
        "Capital Expenditures",
        "Investment in Property, Plant and Equipment",
        "Purchases of Property and Equipment",
        "Capital Expenditure",
    ]

    def get_cash_flow_item(cash_flow_df, possible_keys):
        for key in possible_keys:
            if key in cash_flow_df.index:
                return cash_flow_df.loc[key]
        return None

    operating_cf = get_cash_flow_item(cash_flow, possible_operating_cf_keys)
    capex = get_cash_flow_item(cash_flow, possible_capex_keys)

    if operating_cf is None or capex is None:
        return (
            jsonify(
                {"error": "Necessary financial data not found in cash flow statement."}
            ),
            400,
        )

    # Get EBITDA
    try:
        ebitda_series = income_stmt.loc["EBITDA"]
        ebitda_series = ebitda_series.sort_index(ascending=True)
        ebitda_values = ebitda_series.values
    except KeyError:
        return (
            jsonify({"error": "EBITDA data not available."}),
            400,
        )  # Exit the function

    # Check for zero or negative EBITDA
    if ebitda_values[-1] <= 0 or np.isnan(ebitda_values[-1]):
        return (
            jsonify({"error": "EBITDA data is invalid or non-positive."}),
            400,
        )

    fcf = operating_cf - capex
    fcf = fcf.sort_index(ascending=True)
    fcf_values = fcf.values
    years = fcf.index

    if len(fcf_values) < 2:
        return jsonify({"error": "Not enough data to perform DCF."}), 400

    growth_rates = []
    for i in range(1, len(ebitda_values)):
        if ebitda_values[i - 1] != 0:
            growth = (ebitda_values[i] - ebitda_values[i - 1]) / abs(
                ebitda_values[i - 1]
            )
            growth_rates.append(growth)

    if len(growth_rates) > 0:
        avg_growth_rate = np.mean(growth_rates)
        if np.isnan(avg_growth_rate) or np.isinf(avg_growth_rate):
            avg_growth_rate = 0.05  # Default to 5% if invalid
    else:
        avg_growth_rate = 0.05  # Assume 5% growth rate if data insufficient

    # Calculate WACC
    # Cost of Equity using CAPM
    beta = info.get("beta", 1.0)
    if beta is None or np.isnan(beta):
        beta = 1.0  # Default beta
    risk_free_rate = 0.02  # 2% risk-free rate
    market_return = 0.08  # 8% expected market return
    cost_of_equity = risk_free_rate + beta * (market_return - risk_free_rate)

    # Ensure cost_of_equity is valid
    if np.isnan(cost_of_equity) or cost_of_equity <= 0:
        cost_of_equity = 0.08  # Default to 8%

    # Cost of Debt
    try:
        total_debt = (
            balance_sheet.loc["Short Long Term Debt"].iloc[0]
            + balance_sheet.loc["Long Term Debt"].iloc[0]
        )
    except KeyError:
        total_debt = balance_sheet.loc["Long Term Debt"].iloc[0]
    try:
        interest_expense = income_stmt.loc["Interest Expense"].iloc[0]
    except KeyError:
        interest_expense = 0

    if total_debt > 0:
        cost_of_debt = abs(interest_expense) / total_debt
    else:
        cost_of_debt = 0

    # Tax Rate
    try:
        income_before_tax = income_stmt.loc["Income Before Tax"].iloc[0]
        income_tax_expense = income_stmt.loc["Income Tax Expense"].iloc[0]
        tax_rate = income_tax_expense / income_before_tax
    except KeyError:
        tax_rate = 0.21  # Assume 21% tax rate if data not available

    # Capital Structure
    market_cap = info.get("marketCap", 0)
    total_value = market_cap + total_debt
    if total_value == 0:
        return (
            jsonify(
                {"error": "Market capitalization or total debt data not available."}
            ),
            400,
        )

    weight_of_equity = market_cap / total_value
    weight_of_debt = total_debt / total_value

    # WACC Calculation

    WACC = (weight_of_equity * cost_of_equity) + (
        weight_of_debt * cost_of_debt * (1 - tax_rate)
    )
    if np.isnan(WACC) or WACC <= 0:
        return (
            jsonify({"error": "MACC Calculation invalid"}),
            400,
        )

    # Ensure WACC is greater than terminal growth rate
    terminal_growth_rate = 0.025
    if WACC <= terminal_growth_rate:
        print("WACC is less than or equal to terminal growth rate. Adjusting WACC.")
        WACC = (
            terminal_growth_rate + 0.01
        )  # Set WACC slightly above terminal growth rate

    # Project FCF into the future
    forecast_years = 5
    forecast_fcf = []
    last_fcf = fcf_values[-1]

    for i in range(1, forecast_years + 1):
        projected_fcf = last_fcf * ((1 + avg_growth_rate) ** i)
        forecast_fcf.append(projected_fcf)

    # Discount forecasted FCF
    discounted_fcf = []
    for i in range(1, forecast_years + 1):
        pv = forecast_fcf[i - 1] / ((1 + WACC) ** i)
        discounted_fcf.append(pv)

    # Calculate terminal value
    terminal_growth_rate = 0.025
    terminal_value = (
        forecast_fcf[-1] * (1 + terminal_growth_rate) / (WACC - terminal_growth_rate)
    )
    terminal_value_pv = terminal_value / ((1 + WACC) ** forecast_years)

    # DCF value
    dcf_value = sum(discounted_fcf) + terminal_value_pv

    # Get shares outstanding
    shares_outstanding = info.get("sharesOutstanding", 0)

    if shares_outstanding == 0:
        return jsonify({"error": "Shares outstanding not available."}), 400

    intrinsic_value_per_share = dcf_value / shares_outstanding

    data = {
        "Ticker": ticker,
        "Company Name": company_name,
        "Sector": sector,
        "Intrinsic Value per Share": intrinsic_value_per_share,
    }
    return jsonify(data)


def get_ticker(company_name):
    yfinance = "https://query2.finance.yahoo.com/v1/finance/search"
    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
    params = {"q": company_name, "quotes_count": 1, "country": "United States"}

    res = requests.get(url=yfinance, params=params, headers={"User-Agent": user_agent})
    data = res.json()

    company_code = data["quotes"][0]["symbol"]
    return company_code


def generate_timeseries_plot(df, choosen_company):
  # Create a Plotly figure
  fig = go.Figure()

  # Add the closing price line
  fig.add_trace(go.Scatter(
      x=df.index,
      y=df["Close"],
      mode='lines',
      name='Price',
      line=dict(color='green', width=2),
      hoverinfo='text',
      hovertext=df['Close'].apply(lambda x: f'Price: ${x:.2f}')
  ))

  # Find max and min values
  max_value = df["Close"].max()
  max_date = df["Close"].idxmax()
  min_value = df["Close"].min()
  min_date = df["Close"].idxmin()

  # Add markers for max and min points with adjusted text position
  fig.add_trace(go.Scatter(
      x=[max_date],
      y=[max_value],
      mode='markers+text',
      name='Max Price',
      marker=dict(color='blue', size=10),
      text=[f'Max: ${max_value:.2f}<br>Date: {max_date.date()}'],
      textposition='top right',  # Adjusted position
  ))

  fig.add_trace(go.Scatter(
      x=[min_date],
      y=[min_value],
      mode='markers+text',
      name='Min Price',
      marker=dict(color='red', size=10),
      text=[f'Min: ${min_value:.2f}<br>Date: {min_date.date()}'],
      textposition='bottom right',  # Adjusted position
  ))

  # Update layout with padding
  fig.update_layout(
      title=f"Stock Price for {choosen_company}",
      xaxis_title="Date",
      yaxis_title="Price (US$)",
      legend_title="Legend",
      hovermode="x unified",
      template="plotly_white",  # Use a clean white template
      margin=dict(l=40, r=40, t=40, b=40),  # Add margins to avoid cutting off text
  )
  fig.update_yaxes(automargin=True)
  fig.update_xaxes(automargin=True)
  
  graphJSON = plotly.io.to_json(fig, pretty=True)
  return graphJSON

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
        "Current Price": (
            stock_data["Close"].iloc[-1] if not stock_data.empty else "N/A"
        ),
        "Market Cap": info.get("marketCap", "N/A"),
        "EPS": info.get("trailingEps", "N/A"),
        "Gross Profit": (
            company.financials.loc["Gross Profit"][0]
            if "Gross Profit" in company.financials.index
            else "N/A"
        ),
        "Pre-tax Income": (
            company.financials.loc["Pretax Income"][0]
            if "Pretax Income" in company.financials.index
            else "N/A"
        ),
        "EBITDA": (
            company.financials.loc["EBITDA"][0]
            if "EBITDA" in company.financials.index
            else "N/A"
        ),
        "Total Liabilities": (
            company.balance_sheet.loc["Total Liabilities Net Minority Interest"][0]
            if "Total Liabilities Net Minority Interest" in company.balance_sheet.index
            else "N/A"
        ),
        "Total Assets": (
            company.balance_sheet.loc["Total Assets"][0]
            if "Total Assets" in company.balance_sheet.index
            else "N/A"
        ),
        "End Cash Position": (
            company.cashflow.loc["End Cash Position"][0]
            if "End Cash Position" in company.cashflow.index
            else "N/A"
        ),
    }

    return summary


if __name__ == "__main__":
    app.run(debug=True)
