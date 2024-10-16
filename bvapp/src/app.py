from sklearn.preprocessing import MinMaxScaler
from flask import Flask, jsonify, request
from keras.models import load_model
from pmdarima import auto_arima
import statsmodels.api as sm
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import plotly as plotly
from plotly.subplots import make_subplots
import requests
import yfinance as yf
import pandas as pd
import numpy as np
import json
import re


app = Flask(__name__)


# Load the JSON data from the file
with open("./sp500_tickers.json", "r") as file:
    sp500Json = json.load(file)

# Load the stock price prediction model
model = load_model("combined_sp500_lstm_model.h5")

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


@app.route("/api/sp500_tickers", methods=["GET"])
def get_sp500_tickers():
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    tables = pd.read_html(url)
    df = tables[0]  # The first table contains the S&P 500 data
    df = df[["Symbol", "GICS Sector", "Security"]]  # Select relevant columns - these are ticker, industry and company name
    tickers_data = df.set_index("Symbol")[["GICS Sector", "Security"]].to_dict(
        orient="index"
    )
    return jsonify(tickers_data)


@app.route("/api/stock-data", methods=["POST"])
def get_stock_data():
    data = request.json
    ticker = data.get("company")

    company_name = sp500Json[ticker]["Security"]

    time_period = valid_time_periods[data.get("time_period")]

    # Get company basic info
    info = get_company_basic_info(ticker)

    # Get company summary metrics
    summary_data = get_company_summary(ticker, company_name, time_period)

    industry_name = sp500Json[ticker]['GICS Sector']

    # get other companies in the same industry for basket comparison
    companies_in_industry = []

    for ticker in sp500Json:
        if sp500Json[ticker]["GICS Sector"] == industry_name:
            print(ticker)
            companies_in_industry.append((ticker, sp500Json[ticker]["Security"]))

    ticker = data.get("company")
    time_period = valid_time_periods[data.get("time_period")]
    
    # Fetch stock data
    stock_data = yf.Ticker(ticker).history(period=time_period)

    # Generate plots
    plotJSON = generate_timeseries_plot(stock_data, company_name)
    forecastPlotJSON = generate_arima_forecast_timeseries(ticker)
    industryPEPlotJson = generate_industry_plot(companies_in_industry, industry_name, ticker)
    company_bar_chartsJSON = generate_monetary_charts_1d(ticker, company_name)

    result = {
        "company": company_name,
        "info": info,
        "ticker_symbol": ticker,
        "summary_data": summary_data,
        "plot": plotJSON,
        "forecast_plot": forecastPlotJSON,
        "summary_data": summary_data,
        "monetary_plot": company_bar_chartsJSON,
        "industry_plot": industryPEPlotJson
    }
    

    return jsonify(result)


def generate_arima_forecast_timeseries(ticker):
    print(f"\nFetching data for {ticker}...\n")
    stock_data = yf.download(ticker, start="2015-01-01", end="2024-01-01")

    # Augmented Dickey-Fuller test to check if time series is stationary
    result = sm.tsa.adfuller(stock_data["Close"])
    print(f"ADF Statistic: {result[0]}")
    print(f"p-value: {result[1]}")

    stock_diff = stock_data["Close"].diff().dropna()
    arima_model = auto_arima(stock_diff, seasonal=False, trace=True, stepwise=True)

    n_periods = 30
    forecast, conf_int = arima_model.predict(n_periods=n_periods, return_conf_int=True)
    forecast_dates = pd.date_range(stock_data.index[-1], periods=n_periods, freq="B")

    fig = go.Figure()

    # Add historical stock prices
    fig.add_trace(
        go.Scatter(
            x=stock_data.index,
            y=stock_data["Close"],
            mode="lines",
            name=f"{ticker} Stock Price",
            line=dict(color="green", width=2),
            hoverinfo="text",
            hovertext=stock_data["Close"].apply(lambda x: f"Price: ${x:.2f}"),
        )
    )

    # Add forecast line
    fig.add_trace(
        go.Scatter(
            x=forecast_dates,
            y=forecast.cumsum() + stock_data["Close"].iloc[-1],
            mode="lines",
            name="Forecast",
            line=dict(color="red", width=2),
        )
    )

    # Add confidence interval fill
    fig.add_trace(
        go.Scatter(
            x=forecast_dates,
            y=conf_int[:, 0].cumsum() + stock_data["Close"].iloc[-1],
            mode="lines",
            line=dict(color="red", width=0),
            showlegend=False,
        )
    )

    fig.add_trace(
        go.Scatter(
            x=forecast_dates,
            y=conf_int[:, 1].cumsum() + stock_data["Close"].iloc[-1],
            mode="lines",
            line=dict(color="red", width=0),
            fill="tonexty",
            fillcolor="rgba(255, 0, 0, 0.3)",
            name="Confidence Interval",
            showlegend=True,
        )
    )

    # Update layout
    fig.update_layout(
        title=f"{ticker} Stock Price Forecast",
        xaxis_title="Date",
        yaxis_title="Price (US$)",
        legend_title="Legend",
        hovermode="x unified",
        template="plotly_white",
        margin=dict(l=40, r=40, t=40, b=40),
    )

    graphJSON = plotly.io.to_json(fig, pretty=True)
    return graphJSON


"""
Get news from AlphaVantage API; API key may be invalid after October 16 2024
"""
@app.route("/api/news", methods=["POST"])
def get_cleaned_news():
    data = request.json
    ticker_symbol = data.get("company")

    API_key = "wepcdviwg2zsakkku9cup9x3aua7gxia2790oc2k"
    url1 = f"https://stocknewsapi.com/api/v1/stat?&tickers={ticker_symbol}&date=last30days&page=1&token={API_key}"
    url2 = f"https://stocknewsapi.com/api/v1?tickers={ticker_symbol}&items=3&page=1&token={API_key}"

    try:
        response = requests.get(url1)
        if response.status_code == 200:
            sentiment_data = response.json()
        else:
            print(f"Error: {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        return None

    try:
        response = requests.get(url2)
        if response.status_code == 200:
            news_data = response.json()
        else:
            print(f"Error: {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        return None

    print(sentiment_data, "getttying thre keys !!!!!!!!!!!!!!!!!")
    sentiment_score = sentiment_data["total"][ticker_symbol]["Sentiment Score"]

    print(sentiment_data["total"][ticker_symbol]["Sentiment Score"])
    
    # Extract required information
    news_articles = news_data["data"]
    req_field = ["title", "news_url", "text"]

    cleaned_news = []
    for i in range(3):
        news = {j: news_articles[i][j] for j in req_field}
        cleaned_news.append(news)

    # Extract top 3 news articles
    top_news = {}
    for i in range(3):  # Ensure we don't go beyond the available articles
        top_news[i + 1] = {j: cleaned_news[i][j] for j in ("title", "news_url", "text")}

    # Print top news headlines with cleaned titles
    print("======================= Top News ===============================")
    for i, j in top_news.items():
        title_cleaned = re.sub(r"\s*\(\s*NASDAQ:\w+\s*\)", "", j["title"])
        print(
            f"Headline - {i} \n {j['title']}\n Summary: \n {j['text']} \n Link: \n {j['news_url']}\n\n"
        )

    # Calculate the average overall sentiment score
    # total_score = sum(item["overall_sentiment_score"] for item in cleaned_news)
    # avg_score = total_score / news_len if news_len > 0 else 0

    # Determine sentiment category based on average sentiment score
    if sentiment_score < -0.5:
        avg_sentiment_category = "Bearish"
    elif sentiment_score > 0.5:
        avg_sentiment_category = "Bullish"
    else:
        avg_sentiment_category = "Neutral"

    print(
        f"The average overall sentiment score is: {sentiment_score} ({avg_sentiment_category})"
    )

    # Preparing the dictionary to send to the front end
    news_for_frontend = {
        "top_news": top_news,
        "average_sentiment_score": sentiment_score,
        "avg_sentiment_category": avg_sentiment_category,  # Add sentiment category
    }

    return jsonify(news_for_frontend)


@app.route("/api/stock-valuation", methods=["POST"])
def stock_valuation():
    data = request.json
    company = data.get("company")

    if not company:
        return jsonify({"error": "Company name is required."}), 400

    ticker_input = get_ticker(company)
    ticker = ticker_input.upper()

    stock = yf.Ticker(ticker)
    info = stock.info

    income_stmt = stock.financials
    cash_flow = stock.cashflow
    balance_sheet = stock.balance_sheet

    if income_stmt.empty or cash_flow.empty or balance_sheet.empty:
        return jsonify({"error": "Financial data not available for this ticker."}), 400

    sector = info.get("sector", "Unknown")
    company = info.get("shortName", "Unknown")

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
        )

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

    # Calculate historical EBITDA growth rates
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
        total_debt = balance_sheet.loc["Long Term Debt"].iloc[0]
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
    forecast_ebitda = []
    last_ebitda = ebitda_values[-1]

    for i in range(1, forecast_years + 1):
        projected_ebitda = last_ebitda * ((1 + avg_growth_rate) ** i)
        forecast_ebitda.append(projected_ebitda)

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

    # Assume constant D&A and calculate EBIT
    try:
        depreciation = income_stmt.loc["Depreciation"].iloc[0]
    except KeyError:
        depreciation = 0  # Assume zero if data not available

    forecast_ebit = [ebitda - depreciation for ebitda in forecast_ebitda]

    # Calculate NOPAT (Net Operating Profit After Tax)
    nopat = [ebit * (1 - tax_rate) for ebit in forecast_ebit]

    # Discount forecasted NOPAT
    discounted_cash_flows = []
    for i in range(1, forecast_years + 1):
        pv = nopat[i - 1] / ((1 + WACC) ** i)
        discounted_cash_flows.append(pv)

    # Calculate terminal value
    terminal_value = (
        nopat[-1] * (1 + terminal_growth_rate) / (WACC - terminal_growth_rate)
    )
    terminal_value_pv = terminal_value / ((1 + WACC) ** forecast_years)

    # Check for NaN or infinite terminal value
    if np.isnan(terminal_value_pv) or np.isinf(terminal_value_pv):
        print("Terminal value calculation invalid.")
        return

    # Enterprise Value
    enterprise_value = sum(discounted_cash_flows) + terminal_value_pv

    # Check for NaN or infinite enterprise value
    if np.isnan(enterprise_value) or np.isinf(enterprise_value):
        print("Enterprise value calculation invalid.")
        return

    # Get Cash and Cash Equivalents
    try:
        cash_and_equiv = (
            balance_sheet.loc["Cash"].iloc[0]
            + balance_sheet.loc["Short Term Investments"].iloc[0]
        )
    except KeyError:
        try:
            cash_and_equiv = balance_sheet.loc["Cash"].iloc[0]
        except KeyError:
            cash_and_equiv = 0  # If cash data not available

    # Calculate Net Debt
    net_debt = total_debt - cash_and_equiv

    # Calculate Equity Value
    equity_value = enterprise_value - net_debt

    # Convert values to millions
    enterprise_value_millions = enterprise_value / 1e6
    net_debt_millions = net_debt / 1e6
    equity_value_millions = equity_value / 1e6

    # DCF value
    dcf_value = sum(discounted_fcf) + terminal_value_pv

    # Get shares outstanding
    shares_outstanding = info.get("sharesOutstanding", 0)

    if shares_outstanding == 0:
        return jsonify({"error": "Shares outstanding not available."}), 400

    # Decided to take this out before final
    intrinsic_value_per_share = dcf_value / shares_outstanding

    # Convert values to millions
    enterprise_value_millions = enterprise_value / 1e6
    net_debt_millions = net_debt / 1e6
    equity_value_millions = equity_value / 1e6

    # Prepare output
    data = {
        "Ticker": ticker,
        "Company Name": company,
        "Sector": sector,
        "Enterprise Value (Millions)": f"$ {enterprise_value_millions:.2f} mil",
        "Net Debt (Millions)": f"$ {net_debt_millions:.2f} mil",
        "Equity Value (Millions)": f" $ {equity_value_millions:.2f} mil",
    }

    return jsonify(data)


def get_company_logo(company_domain):
    # Using Clearbit's logo API to get the company logo
    logo_url = f"https://logo.clearbit.com/{company_domain}"

    try:
        response = requests.get(logo_url)
        response.raise_for_status()
        return logo_url
    except Exception as e:
        print(f"Could not retrieve logo for {company_domain}: {e}")
        return None


def generate_industry_plot(companies, industry, chosen_company):
    pe_ratios = []
    market_caps = []

    for ticker_symbol, name in companies:
        try:
            company = yf.Ticker(ticker_symbol)
            info = company.info

            # Append values for each company in the industry
            if info.get("trailingPE") and info.get("marketCap"):
                pe_ratios.append(info.get("trailingPE", 0))
                market_caps.append(info.get("marketCap", 0))

        except Exception as e:
            print(f"Error fetching data for {ticker_symbol}: {e}")
            continue

    # Combine companies and P/E ratios into a list of tuples
    combined_data = list(zip(companies, pe_ratios))

    # Sort the combined data by P/E ratio in descending order
    sorted_data = sorted(combined_data, key=lambda x: x[1], reverse=True)

    # Unzip the sorted data back into two lists
    sorted_companies, sorted_pe_ratios = zip(*sorted_data)

    # Create a list of colors, highlighting the chosen company
    colors = [
        "orange" if ticker == chosen_company else "skyblue"
        for ticker, name in sorted_companies
    ]

    fig = go.Figure()

    # Add horizontal bar chart
    fig.add_trace(
        go.Bar(
            y=[name for _, name in sorted_companies],
            x=sorted_pe_ratios,
            orientation="h",  # Horizontal bar chart
            marker=dict(color=colors),
        )
    )

    fig.update_layout(
        title=f"P/E Ratios of {industry} Companies",
        xaxis_title="P/E Ratio",
        yaxis_title="Companies",
        height=800,  # Increase height for better visibility
        width=1000,  # Increase width for better visibility
        margin=dict(l=100, r=20, t=50, b=50),  # Add margins
        template="plotly_white",  # Use a clean white template,
    )

    graphJSON = plotly.io.to_json(fig, pretty=True)
    return graphJSON


def get_ticker(company_name):
    yfinance = "https://query2.finance.yahoo.com/v1/finance/search"
    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
    params = {"q": company_name, "quotes_count": 1, "country": "United States"}

    res = requests.get(url=yfinance, params=params, headers={"User-Agent": user_agent})
    data = res.json()

    company_code = data["quotes"][0]["symbol"]
    return company_code


def get_company_basic_info(ticker):
    stock = yf.Ticker(ticker)

    # Retrieve company info from Yahoo Finance
    info = stock.info

    # Extract full address information
    address1 = info.get("address1", "N/A")
    address2 = info.get("address2", "")
    city = info.get("city", "")
    state = info.get("state", "")
    zip_code = info.get("zip", "")
    country = info.get("country", "N/A")
    company_domain = (
        info.get("website", "N/A")
        .replace("https://", "")
        .replace("http://", "")
        .strip("/")
    )

    # Format full address
    full_address = (
        f"{address1}, {address2} {city}, {state} {zip_code}, {country}".strip(", ")
    )

    # Extract additional company information
    full_time_employees = info.get("fullTimeEmployees", "N/A")
    company_summary = info.get("longBusinessSummary", "N/A")

    # Retrieve governance risk information
    audit_risk = info.get("auditRisk", "N/A")
    board_risk = info.get("boardRisk", "N/A")
    compensation_risk = info.get("compensationRisk", "N/A")
    shareholder_rights_risk = info.get("shareHolderRightsRisk", "N/A")
    overall_risk = info.get("overallRisk", "N/A")
    logo = get_company_logo(company_domain)

    info_dict = {
        "Company Summary": company_summary,
        "Address": full_address,
        "Full-time Employees": full_time_employees,
        "Audit Risk": audit_risk,
        "Board Risk": board_risk,
        "Compensation Risk": compensation_risk,
        "Shareholder Rights Risk": shareholder_rights_risk,
        "Overall Risk": overall_risk,
        "Company Logo": logo,
    }

    return info_dict


# Predict using the combined model
def predict_stock_price_combined_model(ticker, model, seq_length=60):
    # Download stock data
    stock_data = yf.download(ticker, start="2010-01-01", end="2024-10-01")

    if stock_data.empty:
        print(f"No data found for {ticker}")
        return None

    # Close prices
    prices = stock_data["Close"].values.reshape(-1, 1)

    # Scale the data
    scaler = MinMaxScaler()
    scaled_prices = scaler.fit_transform(prices)

    # Create sequences for prediction
    test_data = scaled_prices[-(seq_length + 1) :]
    X_test = np.array([test_data[:seq_length]])
    X_test = X_test.reshape((X_test.shape[0], X_test.shape[1], 1))

    # Predict and inverse transform to get actual prices
    predicted_scaled = model.predict(X_test)
    predicted_price = scaler.inverse_transform(predicted_scaled)

    return predicted_price[0][0]


def generate_timeseries_plot(df, chosen_company):
    fig = go.Figure()

    # Add the closing price line
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["Close"],
            mode="lines",
            name="Price",
            line=dict(color="green", width=2),
            hoverinfo="text",
            hovertext=df["Close"].apply(lambda x: f"Price: ${x:.2f}"),
        )
    )

    # Find max and min values
    max_value = df["Close"].max()
    max_date = df["Close"].idxmax()
    min_value = df["Close"].min()
    min_date = df["Close"].idxmin()

    # Add markers for max and min points with adjusted text position
    fig.add_trace(
        go.Scatter(
            x=[max_date],
            y=[max_value],
            mode="markers+text",
            name="Max Price",
            marker=dict(color="blue", size=10),
            text=[f"Max: ${max_value:.2f}<br>Date: {max_date.date()}"],
            textposition="middle right",  # Adjusted position
        )
    )

    fig.add_trace(
        go.Scatter(
            x=[min_date],
            y=[min_value],
            mode="markers+text",
            name="Min Price",
            marker=dict(color="red", size=10),
            text=[f"Min: ${min_value:.2f}<br>Date: {min_date.date()}"],
            textposition="middle right",
        )
    )

    fig.update_layout(
        title=f"Stock Price for {chosen_company}",
        xaxis_title="Date",
        yaxis_title="Price (US$)",
        legend_title="Legend",
        hovermode="x unified",
        template="plotly_white",
        margin=dict(l=40, r=40, t=40, b=40),
    )
    fig.update_yaxes(automargin=True)
    fig.update_xaxes(automargin=True)

    graphJSON = plotly.io.to_json(fig, pretty=True)
    return graphJSON


def generate_monetary_charts_1d(ticker_symbol, company_name):
    company = yf.Ticker(ticker_symbol)
    stock_data = company.history(period="1d")

    # Fetch stock data
    info = company.info

    # Create a dictionary to store data in a tabular format
    data = {
        "Metric": [
            "Stock P/E (TTM)",
            "High",
            "Low",
            "Current Price",
            "Market Cap",
            "EPS (TTM)",
            "Gross Profits",
            "Pre-tax Income",
            "EBITDA",
            "Total Liabilities",
            "Total Assets",
            "End Cash Position",
        ],
        "Value": [
            info.get("trailingPE", "N/A"),
            stock_data["High"].iloc[-1] if not stock_data.empty else "N/A",
            stock_data["Low"].iloc[-1] if not stock_data.empty else "N/A",
            stock_data["Close"].iloc[-1] if not stock_data.empty else "N/A",
            info.get("marketCap", "N/A"),
            info.get("trailingEps", "N/A"),
            (
                company.financials.loc["Gross Profit"][0]
                if "Gross Profit" in company.financials.index
                else "N/A"
            ),
            (
                company.financials.loc["Pretax Income"][0]
                if "Pretax Income" in company.financials.index
                else "N/A"
            ),
            (
                company.financials.loc["EBITDA"][0]
                if "EBITDA" in company.financials.index
                else "N/A"
            ),
            (
                company.balance_sheet.loc["Total Liabilities Net Minority Interest"][0]
                if "Total Liabilities Net Minority Interest"
                in company.balance_sheet.index
                else "N/A"
            ),
            (
                company.balance_sheet.loc["Total Assets"][0]
                if "Total Assets" in company.balance_sheet.index
                else "N/A"
            ),
            (
                company.cashflow.loc["End Cash Position"][0]
                if "End Cash Position" in company.cashflow.index
                else "N/A"
            ),
        ],
    }

    df = pd.DataFrame(data)

    # Create a new column 'Formatted Value' with the formatted values
    df["Formatted Value"] = df["Value"].apply(format_value)

    # Create subplots so all the interrim graphs are together
    fig = make_subplots(
        rows=2,
        cols=2,
        specs=[
            [{"type": "table"}, {"type": "bar"}],
            [{"type": "bar", "colspan": 2}, None],
        ],
        subplot_titles=(
            "Company Summary",
            f"Liabilities, Assets, Cash - {company_name}",
            "EBITDA vs Gross Profit",
        ),
        vertical_spacing=0.1,
        horizontal_spacing=0.1,
    )

    # Add metrics table
    fig.add_trace(
        go.Table(
            header=dict(
                values=[df.columns[0], df.columns[1]],
                fill_color="royalblue",
                align="left",
                font=dict(color="white", size=12),
            ),
            cells=dict(
                values=[df.Metric, df["Formatted Value"]],
                fill_color="lavender",
                align="left",
            ),
        ),
        row=1,
        col=1,
    )

    # Bar Chart - Total Liabilities, Total Assets, End Cash Position
    liabilities = data["Value"][9]
    assets = data["Value"][10]
    end_cash = data["Value"][11]

    if all(
        isinstance(value, (int, float)) for value in [liabilities, assets, end_cash]
    ):
        labels1 = ["Total Liabilities", "Total Assets", "End Cash Position"]
        values1 = [liabilities, assets, end_cash]
        fig.add_trace(
            go.Bar(
                x=labels1,
                y=values1,
                text=[f"${int(v / 10**6)} mil" for v in values1],
                textposition="auto",
                marker_color=["#ff9999", "#66b3ff", "#99ff99"],
            ),
            row=1,
            col=2,
        )
    else:
        fig.add_annotation(
            text="Insufficient data for bar chart",
            xref="x domain",
            yref="y domain",
            x=0.5,
            y=0.5,
            showarrow=False,
            row=1,
            col=2,
        )

    # Bar Chart - EBITDA vs Gross Profit
    ebitda = data["Value"][8]
    gross_profits = data["Value"][6]

    if all(isinstance(value, (int, float)) for value in [ebitda, gross_profits]):
        fig.add_trace(
            go.Bar(
                x=["EBITDA", "Gross Profit"],
                y=[ebitda, gross_profits],
                text=[
                    f"${ebitda / 10**9:.2f} bil",
                    f"${gross_profits / 10**9:.2f} bil",
                ],
                textposition="auto",
                marker_color=["#ff9999", "#66b3ff"],
            ),
            row=2,
            col=1,
        )
    else:
        fig.add_annotation(
            text="Insufficient data for bar chart",
            xref="x domain",
            yref="y domain",
            x=0.5,
            y=0.5,
            showarrow=False,
            row=2,
            col=1,
        )

    fig.update_layout(
        height=1000,
        width=1200,
        title_text=f"Financial Overview - {company_name}",
        showlegend=False,
    )

    fig.update_yaxes(title_text="Value in USD", row=1, col=2)
    fig.update_yaxes(title_text="Value in USD", row=2, col=1)

    graphJSON = plotly.io.to_json(fig, pretty=True)
    return graphJSON


def get_company_summary(ticker_symbol, choosen_company, time="1d"):
    """Fetch and return company summary information using yfinance."""
    company = yf.Ticker(ticker_symbol)
    stock_data = company.history(period=str(time))
    info = company.info

    summary = {
        "P/E Ratio": (
            f'{info["trailingPE"]:.2f}'
            if "trailingPE" in info and info["trailingPE"] is not None
            else "N/A"
        ),
        "High": (
            f'$ {stock_data["High"].iloc[-1]:.2f}' if not stock_data.empty else "N/A"
        ),
        "Low": f'$ {stock_data["Low"].iloc[-1]:.2f}' if not stock_data.empty else "N/A",
        "Current Price": (
            f'$ {stock_data["Close"].iloc[-1]:.2f}' if not stock_data.empty else "N/A"
        ),
        "Market Cap": f'$ {info.get("marketCap", "N/A")/ 1_000_000_000:.2f} mil',
        "EPS": f'$ {info.get("trailingEps", "N/A"):.2f}',
        "Gross Profit": (
            f'$ {company.financials.loc["Gross Profit"][0]/1_000_000_000:.2f} mil'
            if "Gross Profit" in company.financials.index
            else "N/A"
        ),
        "Pre-tax Income": (
            f'$ {company.financials.loc["Pretax Income"][0]/1_000_000_000:.2f} mil'
            if "Pretax Income" in company.financials.index
            else "N/A"
        ),
        "EBITDA": (
            f'$ {company.financials.loc["EBITDA"][0]/1_000_000_000:.2f} mil'
            if "EBITDA" in company.financials.index
            else "N/A"
        ),
        "Total Liabilities": (
            f'$ {company.balance_sheet.loc["Total Liabilities Net Minority Interest"][0]/1_000_000_000:.2f} mil'
            if "Total Liabilities Net Minority Interest" in company.balance_sheet.index
            else "N/A"
        ),
        "Total Assets": (
            f'$ {company.balance_sheet.loc["Total Assets"][0]/1_000_000_000:.2f} mil'
            if "Total Assets" in company.balance_sheet.index
            else "N/A"
        ),
        "End Cash Position": (
            f'$ {company.cashflow.loc["End Cash Position"][0]/1_000_000_000:.2f} mil'
            if "End Cash Position" in company.cashflow.index
            else "N/A"
        ),
    }
    return summary


def format_value(val):
    if isinstance(val, (int, float)):
        return f"{val:,.2f}"
    elif isinstance(val, str) and val.replace(",", "").replace(".", "").isdigit():
        return f"{float(val.replace(',', '')):,.2f}"
    return val


if __name__ == "__main__":
    app.run(debug=True)
